/* ORI GVM What's Included gallery.
 *
 * The image row is a CSS scroll-snap carousel on mobile, so swiping is native
 * and needs no JS. This element adds the parts CSS cannot do: autoplay, the
 * dot indicators, and knowing when to stay out of the way.
 *
 * Autoplay is skipped entirely when the delay is 0, when the viewport is wide
 * enough that the images are a static grid, when the user prefers reduced
 * motion, when the section is off screen, or once the visitor has scrolled the
 * row themselves.
 */
class OriGvmGallery extends HTMLElement {
  connectedCallback() {
    this.track = this.querySelector('[data-gallery-track]');
    if (!this.track) return;

    this.slides = Array.from(this.querySelectorAll('[data-gallery-slide]'));
    this.dots = Array.from(this.querySelectorAll('[data-gallery-dot]'));
    if (this.slides.length < 2) return;

    this.delay = parseInt(this.dataset.autoplay || '0', 10) || 0;
    this.index = 0;
    this.timer = null;
    this.userEngaged = false;
    this.visible = true;

    // Matches the carousel breakpoint in ori-gvm-included.css.
    this.carouselMQ = window.matchMedia('(max-width: 749px)');
    this.motionMQ = window.matchMedia('(prefers-reduced-motion: reduce)');

    this.onScroll = this.onScroll.bind(this);
    this.onEngage = this.onEngage.bind(this);
    this.sync = this.sync.bind(this);

    this.track.addEventListener('scroll', this.onScroll, { passive: true });
    ['pointerdown', 'touchstart', 'wheel', 'keydown'].forEach((evt) =>
      this.track.addEventListener(evt, this.onEngage, { passive: true })
    );

    this.dots.forEach((dot) => {
      dot.addEventListener('click', () => {
        this.onEngage();
        this.goTo(parseInt(dot.dataset.galleryDot, 10));
      });
    });

    this.carouselMQ.addEventListener('change', this.sync);
    this.motionMQ.addEventListener('change', this.sync);
    document.addEventListener('visibilitychange', this.sync);

    // Only run the timer while the section is actually on screen.
    if ('IntersectionObserver' in window) {
      this.observer = new IntersectionObserver(
        (entries) => {
          this.visible = entries[0].isIntersecting;
          this.sync();
        },
        { threshold: 0.25 }
      );
      this.observer.observe(this);
    }

    this.sync();
  }

  disconnectedCallback() {
    this.stop();
    if (this.observer) this.observer.disconnect();
    if (this.carouselMQ) this.carouselMQ.removeEventListener('change', this.sync);
    if (this.motionMQ) this.motionMQ.removeEventListener('change', this.sync);
    document.removeEventListener('visibilitychange', this.sync);
  }

  /* Start or stop the timer based on every current condition. */
  sync() {
    const shouldRun =
      this.delay > 0 &&
      this.carouselMQ.matches &&
      !this.motionMQ.matches &&
      !this.userEngaged &&
      this.visible &&
      !document.hidden;

    if (shouldRun) this.start();
    else this.stop();
  }

  start() {
    if (this.timer) return;
    this.timer = window.setInterval(() => this.next(), this.delay);
  }

  stop() {
    if (!this.timer) return;
    window.clearInterval(this.timer);
    this.timer = null;
  }

  /* A deliberate swipe, wheel or tap hands control over for good, so the
   * carousel never yanks the image away while someone is looking at it. */
  onEngage() {
    this.userEngaged = true;
    this.stop();
  }

  next() {
    this.goTo((this.index + 1) % this.slides.length);
  }

  goTo(i) {
    const slide = this.slides[i];
    if (!slide) return;
    this.track.scrollTo({
      left: slide.offsetLeft - this.track.offsetLeft,
      behavior: this.motionMQ.matches ? 'auto' : 'smooth',
    });
    this.setActive(i);
  }

  /* Derive the active slide from scroll position so dots stay correct whether
   * the move came from autoplay, a dot, or a swipe. */
  onScroll() {
    if (this.raf) return;
    this.raf = window.requestAnimationFrame(() => {
      this.raf = null;
      const mid = this.track.scrollLeft + this.track.clientWidth / 2;
      let closest = 0;
      let best = Infinity;
      this.slides.forEach((slide, i) => {
        const center = slide.offsetLeft - this.track.offsetLeft + slide.offsetWidth / 2;
        const dist = Math.abs(center - mid);
        if (dist < best) {
          best = dist;
          closest = i;
        }
      });
      this.setActive(closest);
    });
  }

  setActive(i) {
    this.index = i;
    this.dots.forEach((dot, di) => dot.classList.toggle('is-active', di === i));
  }
}

if (!customElements.get('ori-gvm-gallery')) {
  customElements.define('ori-gvm-gallery', OriGvmGallery);
}
