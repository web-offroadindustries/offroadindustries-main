(function () {
  'use strict';

  var ENGINE = window.ORIGvmCalculatorEngine;
  var TOUR_STORAGE_KEY = 'ori_gvm_tour_seen_v1';

  function element(tagName, className, text) {
    var node = document.createElement(tagName);

    if (className) {
      node.className = className;
    }

    if (text !== undefined && text !== null) {
      node.textContent = String(text);
    }

    return node;
  }

  function append(parent, children) {
    children.forEach(function (child) {
      if (child) {
        parent.appendChild(child);
      }
    });
    return parent;
  }

  function clear(node) {
    while (node && node.firstChild) {
      node.removeChild(node.firstChild);
    }
  }

  function toBoolean(value) {
    return String(value).toLowerCase() === 'true';
  }

  function safeIdentifier(value) {
    return String(value || 'calculator').replace(/[^a-zA-Z0-9_-]/g, '-');
  }

  function safeUrl(value, fallback) {
    var candidate = String(value || '');

    if (candidate.charAt(0) === '/' && candidate.charAt(1) !== '/') {
      return candidate;
    }

    try {
      var parsed = new URL(candidate, window.location.origin);
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
        return parsed.href;
      }
    } catch (error) {
      return fallback;
    }

    return fallback;
  }

  function rounded(value) {
    return String(Math.round(Number(value) || 0));
  }

  function positiveNumber(value) {
    var number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : 0;
  }

  function isEnabled(value) {
    return value === undefined || value === null || String(value).toLowerCase() === 'true';
  }

  function copyData(data) {
    return JSON.parse(JSON.stringify(data));
  }

  function normalizeZone(value) {
    var zone = String(value || '').toLowerCase();

    return ['front', 'middle', 'rear'].includes(zone) ? zone : '';
  }

  function defaultAccessoryRatio(zone) {
    if (zone === 'front') {
      return -0.2;
    }

    if (zone === 'rear') {
      return 1.1;
    }

    return 0.45;
  }

  function dedupeAccessories(items) {
    var seen = new Set();
    var output = [];

    (items || []).forEach(function (item) {
      if (!item || !item.id || seen.has(String(item.id))) {
        return;
      }

      seen.add(String(item.id));
      output.push(item);
    });

    return output;
  }

  class ORIGvmCalculator extends HTMLElement {
    connectedCallback() {
      if (this.initialized) {
        return;
      }

      this.initialized = true;
      this.app = this.querySelector('[data-gvm-app]');
      this.intro = this.querySelector('[data-gvm-intro]');
      this.sectionId = safeIdentifier(this.dataset.sectionId);
      this.sourceUrl = this.dataset.sourceUrl;
      this.warningThreshold = Number(this.dataset.warningThreshold) || 0.95;
      this.enableTour = toBoolean(this.dataset.enableTour);
      this.showAccessories = toBoolean(this.dataset.showAccessories);
      this.useDefaultAccessories = toBoolean(this.dataset.useDefaultAccessories);
      this.showQuoteButton = toBoolean(this.dataset.showQuoteButton);
      this.fallbackQuoteUrl = safeUrl(this.dataset.fallbackQuoteUrl, '/pages/contact');
      this.quoteLabel = this.dataset.quoteLabel || '';
      this.translations = this.parseTranslations();
      this.customData = this.parseCustomData();
      this.abortController = null;
      this.tour = null;
      this.boundTourKeydown = this.handleTourKeydown.bind(this);
      this.resetState();

      if (!this.app || !this.sourceUrl || !ENGINE) {
        this.renderLoadError();
        return;
      }

      this.loadData();
    }

    disconnectedCallback() {
      if (this.abortController) {
        this.abortController.abort();
      }
      this.finishTour(false);
    }

    parseTranslations() {
      var node = this.querySelector('[data-gvm-translations]');

      if (!node) {
        return {};
      }

      try {
        return JSON.parse(node.textContent);
      } catch (error) {
        return {};
      }
    }

    parseCustomData() {
      var node = this.querySelector('[data-gvm-custom-data]');

      if (!node) {
        return {};
      }

      try {
        return JSON.parse(node.textContent);
      } catch (error) {
        return {};
      }
    }

    t(key, fallback) {
      return this.translations[key] || fallback || key;
    }

    resetState() {
      this.state = {
        selectedUpgradeId: null,
        atm: 0,
        tbm: 0,
        passengersKg: 0,
        cargoRearKg: 0,
        selectedAccessoryIds: new Set(),
      };
      this.vehicle = null;
      this.accessoryGroups = null;
      this.accessoriesById = new Map();
      this.numberInputs = {};
      this.summaryLines = {};
    }

    async loadData() {
      if (this.abortController) {
        this.abortController.abort();
      }

      this.abortController = new AbortController();
      this.setAttribute('aria-busy', 'true');
      this.renderLoading();

      try {
        var response = await fetch(this.sourceUrl, {
          cache: 'no-store',
          signal: this.abortController.signal,
        });

        if (!response.ok) {
          throw new Error('HTTP ' + response.status);
        }

        var data = await response.json();

        if (!data || !Array.isArray(data.vehicles) || data.vehicles.length === 0) {
          throw new Error('Invalid calculator dataset');
        }

        this.data = this.applyCustomData(data);
        this.renderVehicleSelector();
        this.setAttribute('aria-busy', 'false');
      } catch (error) {
        if (error && error.name === 'AbortError') {
          return;
        }
        this.renderLoadError();
      }
    }

    applyCustomData(data) {
      var output = copyData(data);
      var customData = this.customData || {};

      if (!this.useDefaultAccessories) {
        this.removeDefaultAccessories(output);
      }
      this.applyCustomSpecifications(output, customData.specifications || []);
      this.applyCustomAccessories(output, customData.accessories || []);

      return output;
    }

    removeDefaultAccessories(data) {
      data.accessories = {
        front: [],
        middle: [],
        rear: [],
      };
      data.accessories_by_category = {};

      (data.vehicles || []).forEach(function (vehicle) {
        if (vehicle && vehicle.accessories) {
          vehicle.accessories = {};
        }
      });
    }

    applyCustomSpecifications(data, specifications) {
      var vehicles = Array.isArray(data.vehicles) ? data.vehicles : [];

      specifications.forEach(function (specification) {
        if (!specification || !isEnabled(specification.enabled)) {
          return;
        }

        var vehicle = vehicles.find(function (item) {
          return String(item.id) === String(specification.vehicle_id || '');
        });

        if (!vehicle || !specification.name) {
          return;
        }

        var upgrade = {
          id:
            'custom_spec_' +
            safeIdentifier(specification.id || specification.vehicle_id + '_' + specification.name),
          name: String(specification.name),
          description: String(specification.description || ''),
          gvm: positiveNumber(specification.gvm),
          gcm: positiveNumber(specification.gcm),
          front_axle_limit: positiveNumber(specification.front_axle_limit),
          rear_axle_limit: positiveNumber(specification.rear_axle_limit),
          towing_capacity: positiveNumber(specification.towing_capacity),
          tbm_limit: positiveNumber(specification.tbm_limit),
        };

        if (
          !upgrade.gvm ||
          !upgrade.gcm ||
          !upgrade.front_axle_limit ||
          !upgrade.rear_axle_limit ||
          !upgrade.towing_capacity ||
          !upgrade.tbm_limit
        ) {
          return;
        }

        if (specification.quote_url) {
          upgrade.quote_url = safeUrl(specification.quote_url, '');
        }

        vehicle.upgrades = Array.isArray(vehicle.upgrades) ? vehicle.upgrades : [];
        vehicle.upgrades.push(upgrade);
      });
    }

    applyCustomAccessories(data, accessories) {
      var vehicles = Array.isArray(data.vehicles) ? data.vehicles : [];

      data.accessories = data.accessories || {};
      data.accessories_by_category = data.accessories_by_category || {};

      accessories.forEach(function (item) {
        if (!item || !isEnabled(item.enabled)) {
          return;
        }

        var zone = normalizeZone(item.zone);
        var mass = positiveNumber(item.mass_kg);

        if (!zone || !item.label || !mass) {
          return;
        }

        var accessory = {
          id: 'custom_accessory_' + safeIdentifier(item.id || item.label),
          label: String(item.label),
          mass_kg: mass,
          position_ratio:
            item.position_ratio === undefined || item.position_ratio === null || item.position_ratio === ''
              ? defaultAccessoryRatio(zone)
              : Number(item.position_ratio),
        };
        var target = String(item.target || 'all').toLowerCase();

        if (!Number.isFinite(accessory.position_ratio)) {
          accessory.position_ratio = defaultAccessoryRatio(zone);
        }

        if (target === 'all') {
          data.accessories[zone] = Array.isArray(data.accessories[zone])
            ? data.accessories[zone]
            : [];
          data.accessories[zone].push(accessory);
          return;
        }

        if (target === 'ute' || target === 'wagon') {
          var category = target === 'ute' ? 'Ute' : 'Wagon';
          data.accessories_by_category[zone] = data.accessories_by_category[zone] || {};
          data.accessories_by_category[zone][category] = Array.isArray(
            data.accessories_by_category[zone][category]
          )
            ? data.accessories_by_category[zone][category]
            : [];
          data.accessories_by_category[zone][category].push(accessory);
          return;
        }

        var vehicle = vehicles.find(function (vehicleItem) {
          return String(vehicleItem.id).toLowerCase() === target;
        });

        if (!vehicle) {
          return;
        }

        vehicle.accessories = vehicle.accessories || {};
        vehicle.accessories[zone] = Array.isArray(vehicle.accessories[zone])
          ? vehicle.accessories[zone]
          : [];
        vehicle.accessories[zone].push(accessory);
      });
    }

    renderLoading() {
      clear(this.app);
      var status = element(
        'p',
        'ori-gvm-calculator__loading',
        this.t('loading', 'Loading calculator data...')
      );
      status.setAttribute('role', 'status');
      this.app.appendChild(status);
    }

    renderLoadError() {
      if (!this.app) {
        return;
      }

      this.setAttribute('aria-busy', 'false');
      clear(this.app);
      var box = element('div', 'ori-gvm-calculator__error');
      box.setAttribute('role', 'alert');
      var message = element(
        'p',
        'ori-gvm-calculator__error-message',
        this.t('load_error', 'Calculator data could not be loaded.')
      );
      var retry = element(
        'button',
        'btn btn--primary ori-gvm-calculator__retry',
        this.t('retry', 'Try again')
      );
      retry.type = 'button';
      retry.addEventListener('click', this.loadData.bind(this));
      append(box, [message, retry]);
      this.app.appendChild(box);
    }

    renderVehicleSelector() {
      clear(this.app);
      var selectorWrap = element('div', 'ori-gvm-calculator__selector');
      var label = element(
        'label',
        'ori-gvm-calculator__selector-label',
        this.t('select_vehicle', 'Select your vehicle')
      );
      var select = element('select', 'ori-gvm-calculator__select');
      var selectId = 'ori-gvm-vehicle-' + this.sectionId;
      select.id = selectId;
      label.htmlFor = selectId;

      var placeholder = element(
        'option',
        '',
        this.t('select_vehicle_placeholder', '-- Select your vehicle --')
      );
      placeholder.value = '';
      select.appendChild(placeholder);

      this.data.vehicles.forEach(function (vehicle) {
        var option = element('option', '', vehicle.name || vehicle.id);
        option.value = String(vehicle.id || '');
        select.appendChild(option);
      });

      select.addEventListener('change', this.handleVehicleChange.bind(this));
      append(selectorWrap, [label, select]);

      this.simulatorHost = element('div', 'ori-gvm-calculator__simulator');
      this.simulatorHost.hidden = true;
      this.vehicleSelect = select;
      append(this.app, [selectorWrap, this.simulatorHost]);

      if (this.intro) {
        this.intro.hidden = false;
      }
    }

    handleVehicleChange() {
      this.finishTour(false);
      var vehicleId = this.vehicleSelect.value;
      clear(this.simulatorHost);
      this.resetState();

      if (!vehicleId) {
        this.simulatorHost.hidden = true;
        if (this.intro) {
          this.intro.hidden = false;
        }
        return;
      }

      var vehicle = this.data.vehicles.find(function (item) {
        return String(item.id) === String(vehicleId);
      });

      this.simulatorHost.hidden = false;
      if (this.intro) {
        this.intro.hidden = true;
      }

      if (!vehicle || !ENGINE.validateVehicle(vehicle).valid) {
        var unavailable = element(
          'p',
          'ori-gvm-calculator__vehicle-error',
          this.t(
            'vehicle_unavailable',
            'This vehicle does not have enough data to calculate safely.'
          )
        );
        unavailable.setAttribute('role', 'alert');
        this.simulatorHost.appendChild(unavailable);
        return;
      }

      this.vehicle = vehicle;
      this.accessoryGroups = this.getAccessoryGroups(vehicle);
      this.indexAccessories();
      this.renderSimulator();
      this.updateResults();

      if (this.enableTour && !this.hasSeenTour()) {
        window.setTimeout(
          function () {
            if (this.vehicle === vehicle) {
              this.startTour(false);
            }
          }.bind(this),
          250
        );
      }
    }

    getAccessoryGroups(vehicle) {
      var globalAccessories = this.data.accessories || {};
      var vehicleAccessories = vehicle.accessories || {};
      var categoryKey = String(vehicle.category || '').toLowerCase() === 'ute' ? 'Ute' : 'Wagon';
      var front = this.getAccessoryZone('front', vehicleAccessories, globalAccessories, categoryKey);
      var middle = this.getAccessoryZone(
        'middle',
        vehicleAccessories,
        globalAccessories,
        categoryKey
      );
      var rear = this.getAccessoryZone('rear', vehicleAccessories, globalAccessories, categoryKey);

      return {
        front: dedupeAccessories(front),
        middle: dedupeAccessories(middle),
        rear: dedupeAccessories(rear),
      };
    }

    getAccessoryZone(zone, vehicleAccessories, globalAccessories, categoryKey) {
      var categoryAccessories =
        this.data.accessories_by_category && this.data.accessories_by_category[zone]
          ? this.data.accessories_by_category[zone][categoryKey] || []
          : [];

      return (globalAccessories[zone] || [])
        .concat(categoryAccessories)
        .concat(vehicleAccessories[zone] || []);
    }

    indexAccessories() {
      var map = this.accessoriesById;
      ['front', 'middle', 'rear'].forEach(
        function (zone) {
          this.accessoryGroups[zone].forEach(function (item) {
            map.set(String(item.id), item);
          });
        }.bind(this)
      );
    }

    selectedAccessories() {
      var map = this.accessoriesById;
      var selected = [];
      this.state.selectedAccessoryIds.forEach(function (id) {
        var accessory = map.get(String(id));
        if (accessory) {
          selected.push(accessory);
        }
      });
      return selected;
    }

    renderSimulator() {
      var titleWrap = element('div', 'ori-gvm-calculator__title-wrap');
      var title = element(
        'h2',
        'ori-gvm-calculator__vehicle-title h2',
        this.vehicle.name + ' - ' + this.t('simulator_suffix', 'Load simulator - GVM calculator')
      );
      var actions = element('div', 'ori-gvm-calculator__actions');
      // Quote button parked for now (client review). Renders only when the
      // "Show quote button" section setting is switched on.
      if (this.showQuoteButton) {
        var quote = element(
          'a',
          'btn btn--primary ori-gvm-calculator__quote',
          this.quoteLabel || this.t('quote_cta', 'View pricing and request a quote')
        );
        quote.href = safeUrl(this.vehicle.quote_url, this.fallbackQuoteUrl);
        append(actions, [quote]);
      }
      // Guided tutorial ("How to use this calculator") is parked for now. The replay
      // button only renders when the tour is enabled via the section setting, so
      // switching "Enable guided tutorial" back on restores it with no code changes.
      if (this.enableTour) {
        var replay = element(
          'button',
          'ori-gvm-calculator__tour-replay',
          this.t('tutorial_replay', 'How to use this calculator')
        );
        replay.type = 'button';
        replay.addEventListener(
          'click',
          function () {
            this.startTour(true, replay);
          }.bind(this)
        );
        append(actions, [replay]);
      }
      append(titleWrap, [title, actions]);

      var workspace = element('div', 'ori-gvm-calculator__workspace');
      this.controlsColumn = element('div', 'ori-gvm-calculator__controls');
      this.resultsColumn = element('div', 'ori-gvm-calculator__results');
      append(this.controlsColumn, [this.renderUpgrades(), this.renderLoadInputs()]);
      append(this.resultsColumn, [this.renderSummary(), this.renderVisualCard()]);
      append(workspace, [this.controlsColumn, this.resultsColumn]);

      // Accessories section parked for now (client review). Renders only when
      // the "Show accessories section" setting is switched on.
      var simulatorChildren = [titleWrap, workspace];
      if (this.showAccessories) {
        simulatorChildren.push(this.renderAccessories());
      }
      append(this.simulatorHost, simulatorChildren);
    }

    renderUpgrades() {
      var card = element('section', 'ori-gvm-calculator__card ori-gvm-calculator__upgrades');
      card.dataset.tour = 'gvm-upgrades';
      var heading = element(
        'h3',
        'ori-gvm-calculator__card-title',
        this.t('upgrades_title', 'GVM and towing upgrades')
      );
      heading.id = 'ori-gvm-upgrades-title-' + this.sectionId;
      var list = element('div', 'ori-gvm-calculator__upgrade-list');
      list.setAttribute('role', 'radiogroup');
      list.setAttribute('aria-labelledby', heading.id);
      list.appendChild(
        this.createUpgradeOption(
          '',
          this.vehicle.factory_option_label || this.t('factory_option', 'Factory (no upgrade)'),
          this.vehicle.factory_option_description ||
            this.t('factory_description', 'Uses factory capacities'),
          true
        )
      );

      (this.vehicle.upgrades || []).forEach(
        function (upgrade) {
          var detail =
            this.t('gvm', 'GVM') +
            ' ' +
            rounded(upgrade.gvm) +
            ' • ' +
            this.t('gcm', 'GCM') +
            ' ' +
            rounded(upgrade.gcm) +
            ' • ' +
            this.t('towing_capacity', 'Towing capacity') +
            ' ' +
            rounded(upgrade.towing_capacity) +
            ' • ' +
            this.t('tbm', 'TBM') +
            ' ' +
            rounded(upgrade.tbm_limit);
          if (upgrade.description) {
            detail = upgrade.description + ' â€¢ ' + detail;
          }
          list.appendChild(this.createUpgradeOption(upgrade.id, upgrade.name, detail, false));
        }.bind(this)
      );

      append(card, [heading, list]);
      return card;
    }

    createUpgradeOption(value, name, description, checked) {
      var label = element('label', 'ori-gvm-calculator__upgrade-option');
      var input = element('input', 'ori-gvm-calculator__radio');
      input.type = 'radio';
      input.name = 'ori-gvm-upgrade-' + this.sectionId;
      input.value = value;
      input.checked = checked;
      input.setAttribute('aria-label', name + ' ' + description);
      input.addEventListener(
        'change',
        function () {
          if (input.checked) {
            this.state.selectedUpgradeId = value || null;
            this.updateResults();
          }
        }.bind(this)
      );
      var copy = element('span', 'ori-gvm-calculator__upgrade-copy');
      var optionName = element('strong', 'ori-gvm-calculator__upgrade-name', name);
      var optionDescription = element(
        'span',
        'ori-gvm-calculator__upgrade-description',
        description
      );
      append(copy, [optionName, optionDescription]);
      append(label, [input, copy]);
      return label;
    }

    renderLoadInputs() {
      var group = element('div', 'ori-gvm-calculator__load-groups');
      var trailer = element('section', 'ori-gvm-calculator__card ori-gvm-calculator__load-card');
      trailer.dataset.tour = 'trailer-hitch';
      var trailerHeading = element(
        'h3',
        'ori-gvm-calculator__card-title',
        this.t('trailer_title', 'Trailer and hitch')
      );
      append(trailer, [
        trailerHeading,
        this.createNumberField('atm', this.t('atm', 'ATM')),
        this.createNumberField('tbm', this.t('tbm', 'TBM')),
      ]);

      var occupants = element(
        'section',
        'ori-gvm-calculator__card ori-gvm-calculator__load-card'
      );
      occupants.dataset.tour = 'occupants-cargo';
      var occupantsHeading = element(
        'h3',
        'ori-gvm-calculator__card-title',
        this.t('occupants_title', 'Occupants and cargo')
      );
      append(occupants, [
        occupantsHeading,
        this.createNumberField('passengersKg', this.t('passengers', 'Passengers')),
        this.createNumberField('cargoRearKg', this.t('cargo_rear', 'Cargo - rear')),
      ]);
      append(group, [trailer, occupants]);
      return group;
    }

    createNumberField(stateKey, labelText) {
      var wrapper = element('label', 'ori-gvm-calculator__field');
      var label = element('span', 'ori-gvm-calculator__field-label', labelText);
      var input = element('input', 'ori-gvm-calculator__input');
      input.type = 'number';
      input.min = '0';
      input.step = '1';
      input.inputMode = 'decimal';
      input.placeholder = this.t('kg', 'kg');
      input.setAttribute('aria-label', labelText);
      input.addEventListener(
        'input',
        function () {
          this.state[stateKey] = input.value;
          this.updateResults();
        }.bind(this)
      );
      this.numberInputs[stateKey] = input;
      append(wrapper, [label, input]);
      return wrapper;
    }

    renderSummary() {
      var card = element('section', 'ori-gvm-calculator__card ori-gvm-calculator__summary');
      card.dataset.tour = 'summary-visual';
      var heading = element(
        'h3',
        'ori-gvm-calculator__card-title',
        this.t('summary_title', 'Summary and compliance')
      );
      var limits = element('div', 'ori-gvm-calculator__summary-grid');
      var definitions = [
        ['vehicleGvm', this.t('vehicle_gvm', 'Vehicle GVM')],
        ['combinedGcm', this.t('combined_gcm', 'Combined GCM')],
        ['towingCapacity', this.t('towing_capacity', 'Towing capacity')],
        ['tbmLimit', this.t('tbm_limit', 'TBM limit')],
        ['atmEntered', this.t('atm_entered', 'ATM entered')],
        ['tbmEntered', this.t('tbm_entered', 'TBM entered')],
      ];

      definitions.forEach(
        function (definition) {
          var line = element('p', 'ori-gvm-calculator__summary-line');
          line.dataset.summaryKey = definition[0];
          line.dataset.label = definition[1];
          this.summaryLines[definition[0]] = line;
          limits.appendChild(line);
        }.bind(this)
      );

      this.complianceChips = element('div', 'ori-gvm-calculator__chips');
      this.complianceChips.setAttribute('aria-live', 'polite');
      append(card, [heading, limits, this.complianceChips]);
      return card;
    }

    renderVisualCard() {
      var card = element('section', 'ori-gvm-calculator__card ori-gvm-calculator__visual-card');
      var heading = element(
        'h3',
        'ori-gvm-calculator__card-title',
        this.t('visual_title', 'Visual')
      );
      this.visualHost = element('div', 'ori-gvm-calculator__visuals');
      append(card, [heading, this.visualHost]);
      return card;
    }

    renderAccessories() {
      var card = element('section', 'ori-gvm-calculator__card ori-gvm-calculator__accessories');
      card.dataset.tour = 'accessories';
      var heading = element(
        'h3',
        'ori-gvm-calculator__card-title',
        this.t('accessories_title', 'Accessories')
      );
      var grid = element('div', 'ori-gvm-calculator__accessory-grid');
      append(grid, [
        this.renderAccessoryGroup('front', this.t('front', 'Front')),
        this.renderAccessoryGroup('middle', this.t('middle', 'Middle')),
        this.renderAccessoryGroup('rear', this.t('rear', 'Rear')),
      ]);
      append(card, [heading, grid]);
      return card;
    }

    renderAccessoryGroup(zone, titleText) {
      var group = element('div', 'ori-gvm-calculator__accessory-group');
      var heading = element('h4', 'ori-gvm-calculator__accessory-title', titleText);
      heading.id = 'ori-gvm-accessory-' + zone + '-' + this.sectionId;
      group.setAttribute('role', 'group');
      group.setAttribute('aria-labelledby', heading.id);
      group.appendChild(heading);
      var items = this.accessoryGroups[zone] || [];

      if (items.length === 0) {
        group.appendChild(
          element(
            'p',
            'ori-gvm-calculator__empty',
            this.t('no_accessories', 'No accessories listed')
          )
        );
        return group;
      }

      items.forEach(
        function (item) {
          var label = element('label', 'ori-gvm-calculator__accessory-option');
          var input = element('input', 'ori-gvm-calculator__checkbox');
          var accessibleLabel =
            String(item.label || item.id) +
            ', ' +
            rounded(item.mass_kg) +
            ' ' +
            this.t('kg', 'kg');
          input.type = 'checkbox';
          input.value = String(item.id);
          input.setAttribute('aria-label', accessibleLabel);
          input.addEventListener(
            'change',
            function () {
              if (input.checked) {
                this.state.selectedAccessoryIds.add(String(item.id));
              } else {
                this.state.selectedAccessoryIds.delete(String(item.id));
              }
              this.updateResults();
            }.bind(this)
          );
          var name = element('span', 'ori-gvm-calculator__accessory-name', item.label || item.id);
          var mass = element(
            'span',
            'ori-gvm-calculator__accessory-mass',
            rounded(item.mass_kg) + ' ' + this.t('kg', 'kg')
          );
          append(label, [input, name, mass]);
          group.appendChild(label);
        }.bind(this)
      );

      return group;
    }

    updateResults() {
      if (!this.vehicle || !this.visualHost || !this.complianceChips) {
        return;
      }

      var result = ENGINE.calculate(this.vehicle, {
        selectedUpgradeId: this.state.selectedUpgradeId,
        atm: this.state.atm,
        tbm: this.state.tbm,
        passengersKg: this.state.passengersKg,
        cargoRearKg: this.state.cargoRearKg,
        selectedAccessories: this.selectedAccessories(),
      });
      var limits = result.limits;

      this.setSummaryLine('vehicleGvm', limits.gvm, true);
      this.setSummaryLine('combinedGcm', limits.gcm, true);
      this.setSummaryLine('towingCapacity', limits.towingCapacity, true);
      this.setSummaryLine('tbmLimit', limits.tbmLimit, true);
      this.setSummaryLine('atmEntered', result.atm, result.atm > 0);
      this.setSummaryLine('tbmEntered', result.tbm, result.tbm > 0);

      if (this.numberInputs.atm) {
        this.numberInputs.atm.max = String(limits.towingCapacity);
      }
      if (this.numberInputs.tbm) {
        this.numberInputs.tbm.max = String(limits.tbmLimit);
      }

      clear(this.complianceChips);
      [
        [this.t('atm', 'ATM'), result.atm, limits.towingCapacity],
        [this.t('tbm', 'TBM'), result.tbm, limits.tbmLimit],
        [this.t('vehicle_total', 'Vehicle total (GVM)'), result.vehicleMass, limits.gvm],
        [this.t('combined_mass', 'Combined mass (GCM)'), result.combinedMass, limits.gcm],
      ].forEach(
        function (definition) {
          this.complianceChips.appendChild(
            this.createStatusChip(definition[0], definition[1], definition[2])
          );
        }.bind(this)
      );

      this.renderVisuals(result);
    }

    setSummaryLine(key, value, hasValue) {
      var line = this.summaryLines[key];

      if (!line) {
        return;
      }

      line.textContent =
        line.dataset.label +
        ': ' +
        (hasValue ? rounded(value) + ' ' + this.t('kg', 'kg') : '—');
    }

    statusLabel(status) {
      var labels = {
        ok: this.t('status_ok', 'Within limit'),
        warning: this.t('status_warning', 'Near limit'),
        danger: this.t('status_danger', 'Over limit'),
        unavailable: this.t('status_unavailable', 'Limit unavailable'),
      };
      return labels[status] || labels.unavailable;
    }

    createStatusChip(label, value, limit) {
      var status = ENGINE.classifyStatus(value, limit, this.warningThreshold);
      var chip = element(
        'div',
        'ori-gvm-calculator__chip ori-gvm-status--' + status
      );
      var values = element(
        'span',
        'ori-gvm-calculator__chip-values',
        label + ': ' + rounded(value) + ' / ' + rounded(limit) + ' ' + this.t('kg', 'kg')
      );
      var statusText = element(
        'span',
        'ori-gvm-calculator__chip-status',
        this.statusLabel(status)
      );
      append(chip, [values, statusText]);
      return chip;
    }

    renderVisuals(result) {
      clear(this.visualHost);
      var gauges = element('div', 'ori-gvm-calculator__gauge-grid');
      append(gauges, [
        this.createRingGauge(
          this.t('front_axle', 'Front axle'),
          result.frontAxle,
          result.limits.frontAxleLimit
        ),
        this.createRingGauge(
          this.t('rear_axle', 'Rear axle'),
          result.rearAxle,
          result.limits.rearAxleLimit
        ),
        this.createVerticalGauge(this.t('tbm', 'TBM'), result.tbm, result.limits.tbmLimit),
        this.createRingGauge(
          this.t('atm', 'ATM'),
          result.atm,
          result.limits.towingCapacity
        ),
      ]);
      var bars = element('div', 'ori-gvm-calculator__bar-grid');
      append(bars, [
        this.createHorizontalGauge(this.t('gvm', 'GVM'), result.vehicleMass, result.limits.gvm),
        this.createHorizontalGauge(this.t('gcm', 'GCM'), result.combinedMass, result.limits.gcm),
      ]);
      append(this.visualHost, [gauges, bars]);
    }

    createRingGauge(label, value, limit) {
      var status = ENGINE.classifyStatus(value, limit, this.warningThreshold);
      var percent = ENGINE.percentage(value, limit);
      var visualPercent = Math.max(0, Math.min(100, percent));
      var wrapper = element(
        'div',
        'ori-gvm-calculator__gauge ori-gvm-status--' + status
      );
      var ring = element('div', 'ori-gvm-calculator__ring');
      var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 120 120');
      svg.setAttribute('role', 'img');
      svg.setAttribute(
        'aria-label',
        label +
          ': ' +
          rounded(value) +
          ' of ' +
          rounded(limit) +
          ' ' +
          this.t('kg', 'kg') +
          ' (' +
          rounded(percent) +
          '%)'
      );
      var track = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      track.setAttribute('class', 'ori-gvm-calculator__ring-track');
      track.setAttribute('cx', '60');
      track.setAttribute('cy', '60');
      track.setAttribute('r', '48');
      track.setAttribute('pathLength', '100');
      var fill = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      fill.setAttribute('class', 'ori-gvm-calculator__ring-fill');
      fill.setAttribute('cx', '60');
      fill.setAttribute('cy', '60');
      fill.setAttribute('r', '48');
      fill.setAttribute('pathLength', '100');
      fill.setAttribute('stroke-dasharray', visualPercent + ' 100');
      append(svg, [track, fill]);
      var center = element(
        'span',
        'ori-gvm-calculator__ring-percent',
        rounded(percent) + '%'
      );
      append(ring, [svg, center]);
      var values = element(
        'span',
        'ori-gvm-calculator__gauge-values',
        rounded(value) + ' / ' + rounded(limit) + ' ' + this.t('kg', 'kg')
      );
      var gaugeLabel = element('span', 'ori-gvm-calculator__gauge-label', label);
      append(wrapper, [ring, values, gaugeLabel]);
      return wrapper;
    }

    createVerticalGauge(label, value, limit) {
      var status = ENGINE.classifyStatus(value, limit, this.warningThreshold);
      var percent = ENGINE.percentage(value, limit);
      var visualPercent = Math.max(0, Math.min(100, percent));
      var wrapper = element(
        'div',
        'ori-gvm-calculator__gauge ori-gvm-calculator__gauge--vertical ori-gvm-status--' + status
      );
      wrapper.setAttribute(
        'aria-label',
        label +
          ': ' +
          rounded(value) +
          ' of ' +
          rounded(limit) +
          ' ' +
          this.t('kg', 'kg') +
          ' (' +
          rounded(percent) +
          '%)'
      );
      var track = element('div', 'ori-gvm-calculator__vertical-track');
      var fill = element('span', 'ori-gvm-calculator__vertical-fill');
      fill.style.height = visualPercent + '%';
      track.appendChild(fill);
      var values = element(
        'span',
        'ori-gvm-calculator__gauge-values',
        rounded(value) + ' / ' + rounded(limit) + ' ' + this.t('kg', 'kg')
      );
      var gaugeLabel = element(
        'span',
        'ori-gvm-calculator__gauge-label',
        label + ' (' + rounded(percent) + '%)'
      );
      append(wrapper, [track, values, gaugeLabel]);
      return wrapper;
    }

    createHorizontalGauge(label, value, limit) {
      var status = ENGINE.classifyStatus(value, limit, this.warningThreshold);
      var percent = ENGINE.percentage(value, limit);
      var visualPercent = Math.max(0, Math.min(100, percent));
      var wrapper = element(
        'div',
        'ori-gvm-calculator__bar ori-gvm-status--' + status
      );
      var barLabel = element('span', 'ori-gvm-calculator__bar-label', label);
      var track = element('div', 'ori-gvm-calculator__bar-track');
      track.setAttribute('role', 'img');
      track.setAttribute(
        'aria-label',
        label +
          ': ' +
          rounded(value) +
          ' of ' +
          rounded(limit) +
          ' ' +
          this.t('kg', 'kg') +
          ' (' +
          rounded(percent) +
          '%)'
      );
      var fill = element('span', 'ori-gvm-calculator__bar-fill');
      fill.style.width = visualPercent + '%';
      track.appendChild(fill);
      var values = element(
        'span',
        'ori-gvm-calculator__bar-values',
        rounded(value) + ' / ' + rounded(limit) + ' ' + this.t('kg', 'kg') + ' (' + rounded(percent) + '%)'
      );
      append(wrapper, [barLabel, track, values]);
      return wrapper;
    }

    hasSeenTour() {
      try {
        return window.localStorage.getItem(TOUR_STORAGE_KEY) === '1';
      } catch (error) {
        return false;
      }
    }

    markTourSeen() {
      try {
        window.localStorage.setItem(TOUR_STORAGE_KEY, '1');
      } catch (error) {
        return;
      }
    }

    tourSteps() {
      return [
        {
          target: '[data-tour="trailer-hitch"]',
          title: this.t('tour_trailer_title', 'Trailer and hitch'),
          text: this.t('tour_trailer_text', 'Enter your trailer ATM and TBM.'),
        },
        {
          target: '[data-tour="occupants-cargo"]',
          title: this.t('tour_occupants_title', 'Occupants and cargo'),
          text: this.t('tour_occupants_text', 'Add realistic passenger and cargo weights.'),
        },
        {
          target: '[data-tour="accessories"]',
          title: this.t('tour_accessories_title', 'Accessories'),
          text: this.t('tour_accessories_text', 'Select fitted and planned accessories.'),
        },
        {
          target: '[data-tour="summary-visual"]',
          title: this.t('tour_summary_title', 'Summary and visual results'),
          text: this.t('tour_summary_text', 'Review every calculated limit.'),
        },
        {
          target: '[data-tour="gvm-upgrades"]',
          title: this.t('tour_upgrades_title', 'GVM upgrades'),
          text: this.t('tour_upgrades_text', 'Compare factory and upgrade limits.'),
        },
      ];
    }

    startTour(force, returnFocus) {
      if (!this.vehicle || !this.simulatorHost || (!force && this.hasSeenTour())) {
        return;
      }

      this.finishTour(false);
      var steps = this.tourSteps()
        .map(
          function (step) {
            step.element = this.simulatorHost.querySelector(step.target);
            return step;
          }.bind(this)
        )
        .filter(function (step) {
          return Boolean(step.element);
        });

      if (steps.length === 0) {
        return;
      }

      var overlay = element('div', 'ori-gvm-calculator__tour-overlay');
      var dialog = element('div', 'ori-gvm-calculator__tour-dialog');
      dialog.setAttribute('role', 'dialog');
      dialog.setAttribute('aria-modal', 'true');
      dialog.setAttribute(
        'aria-label',
        this.t('tutorial_dialog_label', 'Calculator tutorial')
      );
      overlay.appendChild(dialog);
      document.body.appendChild(overlay);

      this.tour = {
        overlay: overlay,
        dialog: dialog,
        steps: steps,
        index: 0,
        highlighted: null,
        returnFocus: returnFocus || document.activeElement,
      };
      document.addEventListener('keydown', this.boundTourKeydown, true);
      this.renderTourStep();
    }

    renderTourStep() {
      if (!this.tour) {
        return;
      }

      var tour = this.tour;
      var step = tour.steps[tour.index];

      if (tour.highlighted) {
        tour.highlighted.classList.remove('ori-gvm-calculator__tour-highlight');
      }
      step.element.classList.add('ori-gvm-calculator__tour-highlight');
      tour.highlighted = step.element;

      var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      step.element.scrollIntoView({
        behavior: reduceMotion ? 'auto' : 'smooth',
        block: 'center',
      });

      clear(tour.dialog);
      var header = element('div', 'ori-gvm-calculator__tour-header');
      var progress = element(
        'span',
        'ori-gvm-calculator__tour-progress',
        this.t('tutorial_step', 'Step') +
          ' ' +
          (tour.index + 1) +
          ' ' +
          this.t('tutorial_of', 'of') +
          ' ' +
          tour.steps.length
      );
      var closeButton = element(
        'button',
        'ori-gvm-calculator__tour-close',
        '×'
      );
      closeButton.type = 'button';
      closeButton.setAttribute('aria-label', this.t('tutorial_close', 'Close tutorial'));
      closeButton.addEventListener(
        'click',
        function () {
          this.finishTour(true);
        }.bind(this)
      );
      append(header, [progress, closeButton]);

      var body = element('div', 'ori-gvm-calculator__tour-body');
      append(body, [
        element('h3', 'ori-gvm-calculator__tour-title', step.title),
        element('p', 'ori-gvm-calculator__tour-text', step.text),
      ]);

      var actions = element('div', 'ori-gvm-calculator__tour-actions');
      var back = element(
        'button',
        'ori-gvm-calculator__tour-button ori-gvm-calculator__tour-button--secondary',
        this.t('tutorial_back', 'Back')
      );
      back.type = 'button';
      back.hidden = tour.index === 0;
      back.addEventListener(
        'click',
        function () {
          tour.index -= 1;
          this.renderTourStep();
        }.bind(this)
      );
      var skip = element(
        'button',
        'ori-gvm-calculator__tour-button ori-gvm-calculator__tour-button--secondary',
        this.t('tutorial_skip', 'Skip')
      );
      skip.type = 'button';
      skip.addEventListener(
        'click',
        function () {
          this.finishTour(true);
        }.bind(this)
      );
      var next = element(
        'button',
        'ori-gvm-calculator__tour-button ori-gvm-calculator__tour-button--primary',
        tour.index === tour.steps.length - 1
          ? this.t('tutorial_done', 'Done')
          : this.t('tutorial_next', 'Next')
      );
      next.type = 'button';
      next.addEventListener(
        'click',
        function () {
          if (tour.index === tour.steps.length - 1) {
            this.finishTour(true);
            return;
          }
          tour.index += 1;
          this.renderTourStep();
        }.bind(this)
      );
      append(actions, [back, skip, next]);
      append(tour.dialog, [header, body, actions]);
      closeButton.focus();
    }

    handleTourKeydown(event) {
      if (!this.tour) {
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        this.finishTour(true);
        return;
      }

      if (event.key !== 'Tab') {
        return;
      }

      var focusable = Array.from(
        this.tour.dialog.querySelectorAll('button:not([hidden]), [href], input, select, [tabindex]:not([tabindex="-1"])')
      ).filter(function (node) {
        return !node.disabled;
      });

      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      var first = focusable[0];
      var last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    finishTour(markSeen) {
      if (!this.tour) {
        return;
      }

      var tour = this.tour;
      this.tour = null;
      document.removeEventListener('keydown', this.boundTourKeydown, true);

      if (tour.highlighted) {
        tour.highlighted.classList.remove('ori-gvm-calculator__tour-highlight');
      }
      if (tour.overlay.parentNode) {
        tour.overlay.parentNode.removeChild(tour.overlay);
      }
      if (markSeen) {
        this.markTourSeen();
      }
      if (tour.returnFocus && typeof tour.returnFocus.focus === 'function') {
        tour.returnFocus.focus();
      }
    }
  }

  if (!window.customElements.get('ori-gvm-calculator')) {
    window.customElements.define('ori-gvm-calculator', ORIGvmCalculator);
  }
})();
