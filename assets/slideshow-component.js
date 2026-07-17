if (!customElements.get("slideshow-component")) {
  class SlideshowComponent extends HTMLElement {
    constructor() {
      super()
      this.selectors = {
        contents: ['.f-slideshow__content-wrapper'],
        selected: '.selected',
        flickity: 'flickity-component',
        pageDots: '.flickity-page-dots',
        pageCounter: '.flickity-page-counter'
      }
      this.domNodes = queryDomNodes(this.selectors, this)
      this.prevIndex = 0

      // Some Shopify deployments can briefly serve this updated asset with the
      // previous slideshow Liquid. Keep the homepage safe during that window:
      // recover the configured interval from Flickity's markup, disable its
      // eager player, and prioritize the LCP image. Explicit deferred-autoplay
      // markup remains authoritative, and slideshows on every other page keep
      // their existing behaviour.
      this._legacyHomepageFallback =
        document.body.classList.contains('template-index') &&
        !this.hasAttribute('data-autoplay-after-interaction')
      this._legacyHomepageAutoplaySpeed = 0
      this._legacyHomepagePlayerDisabled = false
      if (this._legacyHomepageFallback) this._prepareLegacyHomepageFallback()

      // Video-aware autoplay state.
      this._currentVideo = null
      this._onVideoEnd = null
      this._onVideoError = null
      this._onLoadedMeta = null
      this._fallbackTimer = null
      this._reducedMotion =
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
      this._autoplayInteractionEvents = ['wheel', 'pointerdown', 'touchstart', 'keydown']
      this._autoplayInteractionSeen = false
      this._sliderReady = false
      this._sliderInitAttempts = 0
      this._sliderInitStartedAt = Date.now()
      this._onAutoplayInteraction = this._handleAutoplayInteraction.bind(this)
      this._watchForAutoplayInteraction()

      // Bound handlers so add/removeEventListener use the same reference.
      this._onPointerEnter = this._pauseActiveVideo.bind(this)
      this._onPointerLeave = this._resumeActiveVideo.bind(this)

      this.init()
    }

    disconnectedCallback() {
      clearInterval(this.check)
      this._clearVideoWatch()
      this._removeAutoplayInteractionListeners()
      this.removeEventListener('mouseenter', this._onPointerEnter)
      this.removeEventListener('mouseleave', this._onPointerLeave)
      this.removeEventListener('focusin', this._onPointerEnter)
      this.removeEventListener('focusout', this._onPointerLeave)
    }

    init() {
      this.check = setInterval(() => {
        this._sliderInitAttempts += 1
        this.slider = this.domNodes.flickity.slider && this.domNodes.flickity.slider.instance
        if (this.slider && typeof this.slider == 'object') {
          clearInterval(this.check)
          if (this._legacyHomepageFallback) this._disableLegacyHomepageAutoplay()
          this.removeAttribute('data-media-loading')
          this.slider.on('change', this.handleChange.bind(this))
          this.domNodes.contents[0].classList.add('selected')
          this.handleScreenChange()

          // Pause/resume the active video together with the slideshow on hover/focus.
          this.addEventListener('mouseenter', this._onPointerEnter)
          this.addEventListener('mouseleave', this._onPointerLeave)
          this.addEventListener('focusin', this._onPointerEnter)
          this.addEventListener('focusout', this._onPointerLeave)

          this._sliderReady = true
          // Loading a video here defeats deferred autoplay. Wait for the same
          // interaction that starts the player; non-deferred slideshows retain
          // their original eager video behaviour.
          if (!this.deferredAutoplaySpeed || this._autoplayInteractionSeen) this.playVideo()
          this._startDeferredAutoplay()
          if (this.domNodes.pageCounter) {
            this.domNodes.flickity.insertBefore(this.domNodes.pageCounter, null)
          }
        } else if (
          this._sliderInitAttempts >= 100 ||
          Date.now() - this._sliderInitStartedAt >= 10000
        ) {
          clearInterval(this.check)
          this.removeAttribute('data-media-loading')
        }
      }, 100)
    }

    handleChange(index) {
      const sliderCounterCurrent = this.querySelector('.flickity-counter--current')
      const slideContentCurrent = this.domNodes.contents[index];
      const currentTextColor = slideContentCurrent.dataset.textColor;
      this.style.setProperty('--slider-controls-color', currentTextColor);

      this.domNodes.contents.forEach(item => item.classList.remove('selected'))
      this.domNodes.contents[this.prevIndex].classList.add('f-slideshow__content--out')
      this.domNodes.contents[index].classList.add('selected')
      setTimeout(() => {
        this.domNodes.contents[this.prevIndex].classList.remove('f-slideshow__content--out')
        this.prevIndex = index
      }, 300)

      // Handle page counter
      if (this.domNodes.pageCounter && sliderCounterCurrent) {
        sliderCounterCurrent.textContent = index + 1
      }

      this.playVideo()
    }

    get deferredAutoplaySpeed() {
      if (this._legacyHomepageAutoplaySpeed > 0) return this._legacyHomepageAutoplaySpeed
      const speed = Number(this.dataset.autoplayAfterInteraction)
      return Number.isFinite(speed) && speed > 0 ? speed : 0
    }

    _prepareLegacyHomepageFallback() {
      const flickity = this.domNodes.flickity
      if (!flickity) return

      try {
        const options = JSON.parse(flickity.dataset.sliderOptions || '{}')
        const speed = Number(options.autoPlay)
        if (Number.isFinite(speed) && speed > 0) {
          this._legacyHomepageAutoplaySpeed = speed
          options.autoPlay = false
          flickity.dataset.sliderOptions = JSON.stringify(options)
        }
      } catch (_) {
        // Invalid options are left to Flickity's existing error handling.
      }

      const firstSlide = this.querySelector('.f-slideshow__slide')
      if (firstSlide) {
        firstSlide.querySelectorAll('img').forEach((image) => {
          image.setAttribute('loading', 'eager')
          image.setAttribute('fetchpriority', 'high')
        })
      }

      this._disableLegacyHomepageAutoplay()
    }

    _disableLegacyHomepageAutoplay() {
      if (this._legacyHomepagePlayerDisabled) return
      const flickity = this.domNodes.flickity
      const slider = flickity && flickity.slider && flickity.slider.instance
      if (!slider || !slider.options) return

      const speed = Number(slider.options.autoPlay)
      if (!this._legacyHomepageAutoplaySpeed && Number.isFinite(speed) && speed > 0) {
        this._legacyHomepageAutoplaySpeed = speed
      }
      slider.options.autoPlay = false
      // An already-active Flickity Player ignores activatePlayer(). Fully
      // deactivate it now so the first interaction can activate it again and
      // restore pause-on-hover. Older Flickity builds fall back to stopPlayer.
      if (typeof slider.deactivatePlayer === 'function') {
        slider.deactivatePlayer()
      } else if (typeof slider.stopPlayer === 'function') {
        slider.stopPlayer()
      }
      this._legacyHomepagePlayerDisabled = true
    }

    _watchForAutoplayInteraction() {
      if (!this.deferredAutoplaySpeed || this._reducedMotion) return
      this._autoplayInteractionEvents.forEach((eventName) => {
        window.addEventListener(eventName, this._onAutoplayInteraction, { passive: true })
      })
    }

    _handleAutoplayInteraction() {
      if (this._autoplayInteractionSeen) return
      this._autoplayInteractionSeen = true
      this._removeAutoplayInteractionListeners()
      this._startDeferredAutoplay()
    }

    _startDeferredAutoplay() {
      if (
        !this._autoplayInteractionSeen ||
        !this._sliderReady ||
        !this.slider ||
        this._reducedMotion ||
        !this.deferredAutoplaySpeed
      ) return

      this.slider.options.autoPlay = this.deferredAutoplaySpeed
      if (typeof this.slider.activatePlayer === 'function') {
        this.slider.activatePlayer()
      } else {
        this.slider.playPlayer()
      }
      if (this.slider.selectedElement.querySelector('deferred-media')) this.playVideo()
    }

    _removeAutoplayInteractionListeners() {
      this._autoplayInteractionEvents.forEach((eventName) => {
        window.removeEventListener(eventName, this._onAutoplayInteraction)
      })
    }

    get autoplayEnabled() {
      return !!(this.slider && this.slider.options && this.slider.options.autoPlay)
    }

    get autoplaySpeed() {
      const speed = this.slider && this.slider.options && this.slider.options.autoPlay
      return typeof speed === 'number' && speed > 0 ? speed : 5000
    }

    playVideo() {
      // Cancel any pending video-end/fallback advance from the slide we are leaving,
      // then pause its media. Order matters: clear before pause so manual nav (which
      // routes through here) can never trigger a second advance.
      this._clearVideoWatch()
      this.pauseAllMedia()

      const selectedElm = this.slider.selectedElement
      const deferredMedia = selectedElm.querySelector('deferred-media')

      // Image-only slide: keep the configured timed autoplay running, unchanged.
      if (!deferredMedia) {
        if (this.autoplayEnabled) this.slider.playPlayer()
        return
      }

      deferredMedia.loadContent()
      const youtube = deferredMedia.querySelector('.js-youtube')
      const vimeo = deferredMedia.querySelector('.js-vimeo')
      const video = deferredMedia.querySelector('video')

      // The slideshow's video block only renders native <video>, but keep the
      // original external-player calls intact in case markup ever changes.
      if (youtube) youtube.contentWindow.postMessage('{"event":"command","func":"playVideo","args":""}', '*')
      if (vimeo) vimeo.contentWindow.postMessage('{"method":"play"}', '*')

      if (!video) {
        if (this.autoplayEnabled) this.slider.playPlayer()
        return
      }

      // Autoplay off, or visitor prefers reduced motion: original behaviour —
      // play the video, never force an advance, manual nav only.
      if (!this.autoplayEnabled || this._reducedMotion) {
        const p = video.play()
        if (p && typeof p.then === 'function') p.catch(() => {})
        return
      }

      this._playSlideVideo(video)
    }

    _playSlideVideo(video) {
      // Stop the autoplay timer entirely (stopPlayer, not pausePlayer) so Flickity's
      // hover unpausePlayer cannot silently resume advancing while the video plays.
      this.slider.stopPlayer()

      video.loop = false // a looping video never fires 'ended'
      video.muted = true // autoplay-policy compliance
      video.playsInline = true
      try { video.currentTime = 0 } catch (_) {}

      const advance = this._advance.bind(this)
      const onError = () => {
        // Broken src / decode error: don't stall and don't jump — let the broken
        // slide sit for the configured speed, then advance via the normal timer.
        this._clearVideoWatch()
        if (this.autoplayEnabled) this.slider.playPlayer()
      }

      this._currentVideo = video
      this._onVideoEnd = advance
      this._onVideoError = onError
      video.addEventListener('ended', advance, { once: true })
      video.addEventListener('error', onError, { once: true })

      // Hard fallback: if 'ended' never fires, advance after the video's duration
      // (plus buffer), or after the configured slide speed if duration is unknown.
      const armFallback = () => {
        const dur = isFinite(video.duration) && video.duration > 0 ? video.duration : null
        const ms = dur ? dur * 1000 + 2000 : this.autoplaySpeed
        this._fallbackTimer = setTimeout(advance, ms)
      }
      if (video.readyState >= 1) {
        armFallback()
      } else {
        this._onLoadedMeta = armFallback
        video.addEventListener('loadedmetadata', armFallback, { once: true })
      }

      const p = video.play()
      if (p && typeof p.then === 'function') {
        p.catch(() => {
          // Playback blocked (autoplay policy): fall back to the normal timer.
          this._clearVideoWatch()
          if (this.autoplayEnabled) this.slider.playPlayer()
        })
      }
    }

    _advance() {
      this._clearVideoWatch()
      if (this.slider) this.slider.next()
      // The resulting 'change' re-runs playVideo(), which restarts the timed
      // autoplay on an image slide or arms the next video.
    }

    _clearVideoWatch() {
      if (this._currentVideo) {
        if (this._onVideoEnd) this._currentVideo.removeEventListener('ended', this._onVideoEnd)
        if (this._onVideoError) this._currentVideo.removeEventListener('error', this._onVideoError)
        if (this._onLoadedMeta) this._currentVideo.removeEventListener('loadedmetadata', this._onLoadedMeta)
      }
      if (this._fallbackTimer) clearTimeout(this._fallbackTimer)
      this._currentVideo = null
      this._onVideoEnd = null
      this._onVideoError = null
      this._onLoadedMeta = null
      this._fallbackTimer = null
    }

    _pauseActiveVideo() {
      if (!this._currentVideo || !this.autoplayEnabled || this._reducedMotion) return
      this._currentVideo.pause()
      // Hold the auto-advance while paused (hover/focus).
      if (this._fallbackTimer) {
        clearTimeout(this._fallbackTimer)
        this._fallbackTimer = null
      }
    }

    _resumeActiveVideo() {
      const video = this._currentVideo
      if (!video || !this.autoplayEnabled || this._reducedMotion) return
      if (video.ended) return
      const p = video.play()
      if (p && typeof p.then === 'function') p.catch(() => {})
      // Re-arm the hard fallback based on the time left to play.
      if (!this._fallbackTimer && this._onVideoEnd) {
        const remaining = isFinite(video.duration) && video.duration > 0
          ? (video.duration - video.currentTime) * 1000 + 2000
          : this.autoplaySpeed
        this._fallbackTimer = setTimeout(this._onVideoEnd, remaining)
      }
    }

    pauseAllMedia() {
      this.querySelectorAll(".js-youtube").forEach((video) => {
        video.contentWindow.postMessage(
          '{"event":"command","func":"' + "pauseVideo" + '","args":""}',
          "*"
        );
      });
      this.querySelectorAll(".js-vimeo").forEach((video) => {
        video.contentWindow.postMessage('{"method":"pause"}', "*");
      });
      this.querySelectorAll("video").forEach((video) => video.pause());
    }

    handleScreenChange() {
      if (FoxThemeSettings.isMobile) {
        // this.domNodes.flickity.toggleFade()
      }
      document.addEventListener('matchMobile', () => {
        // this.domNodes.flickity.toggleFade()
      })
      document.addEventListener('unmatchMobile', () => {
        // this.domNodes.flickity.toggleFade(true)
      })
    }
  }

  customElements.define('slideshow-component', SlideshowComponent)
}
