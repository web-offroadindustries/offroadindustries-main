/*
 * <photo-uploader> - direct browser-to-Cloudinary upload for the Warranty Claim form.
 *
 * Shopify's native contact form cannot receive file attachments, so files are
 * uploaded straight to Cloudinary (unsigned upload preset) and the returned
 * secure URLs are written into hidden contact[Photo N] fields. Those URLs then
 * arrive in the warranty notification email as clickable links.
 *
 * Required data attributes:
 *   data-cloud-name      Cloudinary cloud name
 *   data-upload-preset   Unsigned upload preset name
 * Optional:
 *   data-max-files       Max number of files (default 8)
 *   data-max-size-mb     Max size per file in MB (default 10)
 *   data-require         "true" to require at least one photo before submit
 */
if (!customElements.get('photo-uploader')) {
  class PhotoUploader extends HTMLElement {
    connectedCallback() {
      this.cloudName = this.dataset.cloudName;
      this.preset = this.dataset.uploadPreset;
      this.maxFiles = parseInt(this.dataset.maxFiles || '8', 10);
      this.maxSize = (parseFloat(this.dataset.maxSizeMb || '10') || 10) * 1024 * 1024;
      this.required = this.dataset.require === 'true';

      this.input = this.querySelector('[data-uploader-input]');
      this.dropzone = this.querySelector('[data-uploader-dropzone]');
      this.list = this.querySelector('[data-uploader-list]');
      this.hidden = this.querySelector('[data-uploader-hidden]');
      this.status = this.querySelector('[data-uploader-status]');
      this.form = this.closest('form');

      this.seq = 0; // running id for hidden field naming
      this.completed = 0; // successfully uploaded count
      this.inFlight = 0; // uploads currently running

      if (!this.input || !this.cloudName || !this.preset) return;

      this._onChange = this._onChange.bind(this);
      this._onDragOver = this._onDragOver.bind(this);
      this._onDragLeave = this._onDragLeave.bind(this);
      this._onDrop = this._onDrop.bind(this);
      this._onSubmit = this._onSubmit.bind(this);

      this.input.addEventListener('change', this._onChange);
      if (this.dropzone) {
        this.dropzone.addEventListener('dragover', this._onDragOver);
        this.dropzone.addEventListener('dragleave', this._onDragLeave);
        this.dropzone.addEventListener('drop', this._onDrop);
      }
      if (this.form) this.form.addEventListener('submit', this._onSubmit, true);
    }

    disconnectedCallback() {
      if (this.input) this.input.removeEventListener('change', this._onChange);
      if (this.dropzone) {
        this.dropzone.removeEventListener('dragover', this._onDragOver);
        this.dropzone.removeEventListener('dragleave', this._onDragLeave);
        this.dropzone.removeEventListener('drop', this._onDrop);
      }
      if (this.form) this.form.removeEventListener('submit', this._onSubmit, true);
    }

    _onChange(e) {
      this._addFiles(e.target.files);
      this.input.value = '';
    }

    _onDragOver(e) {
      e.preventDefault();
      this.dropzone.classList.add('is-dragover');
    }

    _onDragLeave() {
      this.dropzone.classList.remove('is-dragover');
    }

    _onDrop(e) {
      e.preventDefault();
      this.dropzone.classList.remove('is-dragover');
      if (e.dataTransfer && e.dataTransfer.files) this._addFiles(e.dataTransfer.files);
    }

    _currentCount() {
      return this.list ? this.list.querySelectorAll('.f-wc-upload__item').length : 0;
    }

    _addFiles(fileList) {
      var files = Array.prototype.slice.call(fileList || []);
      for (var i = 0; i < files.length; i++) {
        if (this._currentCount() >= this.maxFiles) {
          this._setStatus('You can upload up to ' + this.maxFiles + ' files.', true);
          break;
        }
        var file = files[i];
        if (file.size > this.maxSize) {
          this._setStatus('"' + file.name + '" is larger than ' + (this.maxSize / 1048576) + 'MB.', true);
          continue;
        }
        this._uploadFile(file);
      }
    }

    _uploadFile(file) {
      var self = this;
      var id = 'wc-photo-' + (++this.seq);

      var item = document.createElement('li');
      item.className = 'f-wc-upload__item';
      item.dataset.itemId = id;

      var thumb = document.createElement('span');
      thumb.className = 'f-wc-upload__thumb';
      if (file.type && file.type.indexOf('image/') === 0) {
        var objUrl = URL.createObjectURL(file);
        var img = document.createElement('img');
        img.src = objUrl;
        img.alt = '';
        img.onload = function () { URL.revokeObjectURL(objUrl); };
        thumb.appendChild(img);
      } else {
        thumb.classList.add('f-wc-upload__thumb--file');
        thumb.textContent = (file.name.split('.').pop() || 'file').toUpperCase();
      }

      var meta = document.createElement('span');
      meta.className = 'f-wc-upload__name';
      meta.textContent = file.name;

      var bar = document.createElement('span');
      bar.className = 'f-wc-upload__progress';
      var barFill = document.createElement('span');
      barFill.className = 'f-wc-upload__progress-fill';
      bar.appendChild(barFill);

      var remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'f-wc-upload__remove';
      remove.setAttribute('aria-label', 'Remove ' + file.name);
      remove.innerHTML = '&times;';

      item.appendChild(thumb);
      item.appendChild(meta);
      item.appendChild(bar);
      item.appendChild(remove);
      this.list.appendChild(item);

      this.inFlight++;
      this._setStatus('Uploading ' + this.inFlight + ' file(s)...');

      var xhr = new XMLHttpRequest();
      xhr.open('POST', 'https://api.cloudinary.com/v1_1/' + this.cloudName + '/auto/upload');

      xhr.upload.onprogress = function (evt) {
        if (evt.lengthComputable) {
          barFill.style.width = Math.round((evt.loaded / evt.total) * 100) + '%';
        }
      };

      xhr.onload = function () {
        self.inFlight--;
        var ok = false;
        try {
          var res = JSON.parse(xhr.responseText);
          if (xhr.status >= 200 && xhr.status < 300 && res.secure_url) {
            ok = true;
            self._attachHidden(id, res.secure_url);
            item.classList.add('is-done');
            barFill.style.width = '100%';
          }
        } catch (err) { /* handled below */ }
        if (!ok) {
          item.classList.add('is-error');
          meta.textContent = file.name + ' - upload failed';
        } else {
          self.completed++;
        }
        self._finishStatus();
      };

      xhr.onerror = function () {
        self.inFlight--;
        item.classList.add('is-error');
        meta.textContent = file.name + ' - upload failed';
        self._finishStatus();
      };

      remove.addEventListener('click', function () {
        try { xhr.abort(); } catch (e) {}
        var wasDone = item.classList.contains('is-done');
        var hiddenField = self.hidden.querySelector('[data-hidden-for="' + id + '"]');
        if (hiddenField) hiddenField.parentNode.removeChild(hiddenField);
        item.parentNode.removeChild(item);
        if (wasDone && self.completed > 0) self.completed--;
        self._finishStatus();
      });

      var data = new FormData();
      data.append('file', file);
      data.append('upload_preset', this.preset);
      xhr.send(data);
    }

    _attachHidden(id, url) {
      // number the field by its position so email labels read Photo 1, Photo 2...
      var index = this.hidden.querySelectorAll('input').length + 1;
      var field = document.createElement('input');
      field.type = 'hidden';
      field.name = 'contact[Photo ' + index + ']';
      field.value = url;
      field.dataset.hiddenFor = id;
      this.hidden.appendChild(field);
    }

    _setStatus(msg, isError) {
      if (!this.status) return;
      this.status.textContent = msg || '';
      this.status.classList.toggle('is-error', !!isError);
    }

    _finishStatus() {
      if (this.inFlight > 0) {
        this._setStatus('Uploading ' + this.inFlight + ' file(s)...');
      } else {
        var n = this._uploadedCount();
        this._setStatus(n ? n + ' photo(s) attached.' : '');
      }
    }

    _uploadedCount() {
      return this.hidden ? this.hidden.querySelectorAll('input').length : 0;
    }

    _onSubmit(e) {
      if (this.inFlight > 0) {
        e.preventDefault();
        e.stopImmediatePropagation();
        this._setStatus('Please wait for your photos to finish uploading.', true);
        this.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      if (this.required && this._uploadedCount() === 0) {
        e.preventDefault();
        e.stopImmediatePropagation();
        this._setStatus('Please attach at least one photo before submitting.', true);
        this.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }

  customElements.define('photo-uploader', PhotoUploader);
}
