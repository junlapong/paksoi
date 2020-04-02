var app = (function () {
'use strict';

function noop() {}

function assign(target) {
	var k,
		source,
		i = 1,
		len = arguments.length;
	for (; i < len; i++) {
		source = arguments[i];
		for (k in source) target[k] = source[k];
	}

	return target;
}

function appendNode(node, target) {
	target.appendChild(node);
}

function insertNode(node, target, anchor) {
	target.insertBefore(node, anchor);
}

function detachNode(node) {
	node.parentNode.removeChild(node);
}

function reinsertChildren(parent, target) {
	while (parent.firstChild) target.appendChild(parent.firstChild);
}

function destroyEach(iterations) {
	for (var i = 0; i < iterations.length; i += 1) {
		if (iterations[i]) iterations[i].d();
	}
}

function createFragment() {
	return document.createDocumentFragment();
}

function createElement(name) {
	return document.createElement(name);
}

function createSvgElement(name) {
	return document.createElementNS('http://www.w3.org/2000/svg', name);
}

function createText(data) {
	return document.createTextNode(data);
}

function createComment() {
	return document.createComment('');
}

function addListener(node, event, handler) {
	node.addEventListener(event, handler, false);
}

function removeListener(node, event, handler) {
	node.removeEventListener(event, handler, false);
}

function setAttribute(node, attribute, value) {
	node.setAttribute(attribute, value);
}

function toNumber(value) {
	return value === '' ? undefined : +value;
}

function children (element) {
	return Array.from(element.childNodes);
}

function claimElement (nodes, name, attributes, svg) {
	for (var i = 0; i < nodes.length; i += 1) {
		var node = nodes[i];
		if (node.nodeName === name) {
			for (var j = 0; j < node.attributes.length; j += 1) {
				var attribute = node.attributes[j];
				if (!attributes[attribute.name]) node.removeAttribute(attribute.name);
			}
			return nodes.splice(i, 1)[0]; // TODO strip unwanted attributes
		}
	}

	return svg ? createSvgElement(name) : createElement(name);
}

function claimText (nodes, data) {
	for (var i = 0; i < nodes.length; i += 1) {
		var node = nodes[i];
		if (node.nodeType === 3) {
			node.data = data;
			return nodes.splice(i, 1)[0];
		}
	}

	return createText(data);
}

function blankObject() {
	return Object.create(null);
}

function destroy(detach) {
	this.destroy = noop;
	this.fire('destroy');
	this.set = this.get = noop;

	if (detach !== false) this._fragment.u();
	this._fragment.d();
	this._fragment = this._state = null;
}

function destroyDev(detach) {
	destroy.call(this, detach);
	this.destroy = function() {
		console.warn('Component was already destroyed');
	};
}

function differs(a, b) {
	return a !== b || ((a && typeof a === 'object') || typeof a === 'function');
}

function dispatchObservers(component, group, changed, newState, oldState) {
	for (var key in group) {
		if (!changed[key]) continue;

		var newValue = newState[key];
		var oldValue = oldState[key];

		var callbacks = group[key];
		if (!callbacks) continue;

		for (var i = 0; i < callbacks.length; i += 1) {
			var callback = callbacks[i];
			if (callback.__calling) continue;

			callback.__calling = true;
			callback.call(component, newValue, oldValue);
			callback.__calling = false;
		}
	}
}

function fire(eventName, data) {
	var handlers =
		eventName in this._handlers && this._handlers[eventName].slice();
	if (!handlers) return;

	for (var i = 0; i < handlers.length; i += 1) {
		handlers[i].call(this, data);
	}
}

function get(key) {
	return key ? this._state[key] : this._state;
}

function init(component, options) {
	component._observers = { pre: blankObject(), post: blankObject() };
	component._handlers = blankObject();
	component._bind = options._bind;

	component.options = options;
	component.root = options.root || component;
	component.store = component.root.store || options.store;
}

function observe(key, callback, options) {
	var group = options && options.defer
		? this._observers.post
		: this._observers.pre;

	(group[key] || (group[key] = [])).push(callback);

	if (!options || options.init !== false) {
		callback.__calling = true;
		callback.call(this, this._state[key]);
		callback.__calling = false;
	}

	return {
		cancel: function() {
			var index = group[key].indexOf(callback);
			if (~index) group[key].splice(index, 1);
		}
	};
}

function observeDev(key, callback, options) {
	var c = (key = '' + key).search(/[^\w]/);
	if (c > -1) {
		var message =
			'The first argument to component.observe(...) must be the name of a top-level property';
		if (c > 0)
			message += ", i.e. '" + key.slice(0, c) + "' rather than '" + key + "'";

		throw new Error(message);
	}

	return observe.call(this, key, callback, options);
}

function on(eventName, handler) {
	if (eventName === 'teardown') return this.on('destroy', handler);

	var handlers = this._handlers[eventName] || (this._handlers[eventName] = []);
	handlers.push(handler);

	return {
		cancel: function() {
			var index = handlers.indexOf(handler);
			if (~index) handlers.splice(index, 1);
		}
	};
}

function onDev(eventName, handler) {
	if (eventName === 'teardown') {
		console.warn(
			"Use component.on('destroy', ...) instead of component.on('teardown', ...) which has been deprecated and will be unsupported in Svelte 2"
		);
		return this.on('destroy', handler);
	}

	return on.call(this, eventName, handler);
}

function set(newState) {
	this._set(assign({}, newState));
	if (this.root._lock) return;
	this.root._lock = true;
	callAll(this.root._beforecreate);
	callAll(this.root._oncreate);
	callAll(this.root._aftercreate);
	this.root._lock = false;
}

function _set(newState) {
	var oldState = this._state,
		changed = {},
		dirty = false;

	for (var key in newState) {
		if (differs(newState[key], oldState[key])) changed[key] = dirty = true;
	}
	if (!dirty) return;

	this._state = assign({}, oldState, newState);
	this._recompute(changed, this._state);
	if (this._bind) this._bind(changed, this._state);

	if (this._fragment) {
		dispatchObservers(this, this._observers.pre, changed, this._state, oldState);
		this._fragment.p(changed, this._state);
		dispatchObservers(this, this._observers.post, changed, this._state, oldState);
	}
}

function setDev(newState) {
	if (typeof newState !== 'object') {
		throw new Error(
			this._debugName + '.set was called without an object of data key-values to update.'
		);
	}

	this._checkReadOnly(newState);
	set.call(this, newState);
}

function callAll(fns) {
	while (fns && fns.length) fns.pop()();
}

function _mount(target, anchor) {
	this._fragment.m(target, anchor);
}

function _unmount() {
	if (this._fragment) this._fragment.u();
}

var protoDev = {
	destroy: destroyDev,
	get: get,
	fire: fire,
	observe: observeDev,
	on: onDev,
	set: setDev,
	teardown: destroyDev,
	_recompute: noop,
	_set: _set,
	_mount: _mount,
	_unmount: _unmount
};

let loading;

async function load(url) {
  if (window.google && window.google.maps) return google.maps;
  if (loading) return loading;

  loading = new Promise((resolve, reject) => {
    window.__SvelteGoogleMapsInit = () => resolve(google.maps);

    const src = url + '&callback=__SvelteGoogleMapsInit';
    const script = document.createElement('script');
    script.onerror = () => reject(new Error(`Failed to load google maps scripts (${src})`));
    script.async = true;
    script.defer = true;
    script.charset = 'utf-8';
    script.src = src;

    const firstScript = document.getElementsByTagName("script")[0];
    firstScript.parentNode.insertBefore(script, firstScript);
  });

  return loading;
}

function deferred() {
  let _resolve, _reject;
  
  const later = new Promise((resolve, reject) => {
    _resolve = resolve;
    _reject = reject;
  });

  later.resolve = _resolve;
  later.reject = _reject;

  return later;
}

class Context {
  constructor(API_KEY, options = {}) {
    const { beta = false } = options;
    this.url = `https://maps.googleapis.com/maps/api/js?key=${API_KEY}${
      beta ? '&v=3.exp&use_slippy=true' : ''
    }`;

    this.api = deferred();
    this.instance = deferred();
  }

  async load(element, options) {
    const api = await load(this.url);
    const map = new api.Map(element, options);

    this.api.resolve(api);
    this.instance.resolve(map);

    return { api, map };
  }

  async ready() {
    const api = await this.api;
    const map = await this.instance;

    return { api, map };
  }
}

function deferred$1() {
  let _resolve, _reject;
  
  const later = new Promise((resolve, reject) => {
    _resolve = resolve;
    _reject = reject;
  });

  later.resolve = _resolve;
  later.reject = _reject;

  return later;
}

function changer() {
  let changing = false;

  return callback => {
    if (changing) return;

    changing = true;
    callback();
    changing = false;
  };
}

function defer(callback) {
  setTimeout(callback, 0);
}

const supported = typeof IntersectionObserver !== 'undefined' && typeof WeakMap !== 'undefined';

let observer;
let listeners;
if (supported) {
  listeners = new WeakMap();

  const notify = entries => {
    for (const entry of entries) {
      const listener = listeners.get(entry.target);
      if (listener) listener();
    }
  };

  observer = new IntersectionObserver(notify);
}

function intersection(node, callback) {
  if (!supported) {
    defer(callback);
    return { teardown() {} };
  }

  listeners.set(node, callback);
  observer.observe(node);

  return {
    teardown() {
      listeners.delete(node);
      observer.unobserve(node);
    }
  }
}

/* node_modules/svelte-google-maps/Map.html generated by Svelte v1.51.0 */
function data$1() {
  return {
    defer: false,
    center: { lat: 0, lng: 0 },
    zoom: 8,
    instance: null,
    loading: null,
    loaded: false
  };
}

var methods = {
  async load() {
    let { instance, map: context, center, zoom, loaded, loading } = this.get();

    if (loaded) return instance;
    if (loading) return loading;

    loading = context.load(this.refs.map, { center, zoom }).then(({ map }) => map);
    this.set({ loaded: false, loading });

    instance = await loading;

    // Setup two-way binding between component and map
    // - Use `changer` to avoid additional sets/changes for internal changes
    const change = changer();

    // Attach listeners to instance
    instance.addListener('zoom_changed', () => {
      change(() => {
        const zoom = instance.getZoom();
        this.set({ zoom });
      });
    });

    instance.addListener('center_changed', () => {          
      change(() => {
        const center = instance.getCenter();
        const lat = center.lat();
        const lng = center.lng();

        this.set({ center: { lat, lng } });
      });
    });

    // Attach observers to component
    this.observe('center', center => {
      change(() => instance.setCenter(center));
    }, { init: false });

    this.observe('zoom', zoom => {
      change(() => instance.setZoom(zoom));
    }, { init: false });

    this.set({ instance, loaded: true, loading: null });

    return instance;
  }
};

function oncreate() {
  // Load map immediately or wait defer until intersection
  const defer$$1 = this.get('defer');
  if (!defer$$1 || defer$$1 === 'false') this.load();
}

async function ondestroy() {
  let { instance, loading } = this.get();
  
  if (!instance && loading) instance = await loading;
  if (!instance) return;

  // TODO Remove listeners from instance
  console.log('destroy', instance);
}

function encapsulateStyles$1(node) {
	setAttribute(node, "svelte-1791593990", "");
}

function create_main_fragment$1(state, component) {
	var div, intersection_handler, text, div_1, slot_content_default = component._slotted.default;

	return {
		c: function create() {
			div = createElement("div");
			text = createText("\n");
			div_1 = createElement("div");
			this.h();
		},

		l: function claim(nodes) {
			div = claimElement(nodes, "DIV", {}, false);
			var div_nodes = children(div);

			div_nodes.forEach(detachNode);
			text = claimText(nodes, "\n");

			div_1 = claimElement(nodes, "DIV", {}, false);
			var div_1_nodes = children(div_1);

			div_1_nodes.forEach(detachNode);
			this.h();
		},

		h: function hydrate() {
			encapsulateStyles$1(div);
			setAttribute(div, "svelte-ref-map", "");

			intersection_handler = intersection.call(component, div, function(event) {
				component.load();
			});

			encapsulateStyles$1(div_1);
			setAttribute(div_1, "svelte-ref-children", "");
		},

		m: function mount(target, anchor) {
			insertNode(div, target, anchor);
			component.refs.map = div;
			insertNode(text, target, anchor);
			insertNode(div_1, target, anchor);

			if (slot_content_default) {
				appendNode(slot_content_default, div_1);
			}

			component.refs.children = div_1;
		},

		p: noop,

		u: function unmount() {
			detachNode(div);
			detachNode(text);
			detachNode(div_1);

			if (slot_content_default) {
				reinsertChildren(div_1, slot_content_default);
			}
		},

		d: function destroy$$1() {
			intersection_handler.teardown();
			if (component.refs.map === div) component.refs.map = null;
			if (component.refs.children === div_1) component.refs.children = null;
		}
	};
}

function Map(options) {
	this._debugName = '<Map>';
	if (!options || (!options.target && !options.root)) throw new Error("'target' is a required option");
	init(this, options);
	this.refs = {};
	this._state = assign(data$1(), options.data);

	this._handlers.destroy = [ondestroy];

	this._slotted = options.slots || {};

	var _oncreate = oncreate.bind(this);

	if (!options.root) {
		this._oncreate = [_oncreate];
	} else {
	 	this.root._oncreate.push(_oncreate);
	 }

	this.slots = {};

	this._fragment = create_main_fragment$1(this._state, this);

	if (options.target) {
		var nodes = children(options.target);
		options.hydrate ? this._fragment.l(nodes) : this._fragment.c();
		nodes.forEach(detachNode);
		this._fragment.m(options.target, options.anchor || null);

		callAll(this._oncreate);
	}
}

assign(Map.prototype, methods, protoDev);

Map.prototype._checkReadOnly = function _checkReadOnly(newState) {
};

/* node_modules/svelte-google-maps/Marker.html generated by Svelte v1.51.0 */
function data$2() {
	return { marker: deferred$1() };
}

async function oncreate$1() {
  let { map: context, position, title, label, icon } = this.get();

  const { api, map } = await context.ready();

  const marker = new api.Marker({
    position,
    title,
    label,
    icon,
    map
  });

  this.get('marker').resolve(marker);
}

async function ondestroy$1() {
  const marker = await this.get('marker');
  marker.setMap(null);
}

function create_main_fragment$2(state, component) {

	return {
		c: noop,

		l: noop,

		m: noop,

		p: noop,

		u: noop,

		d: noop
	};
}

function Marker(options) {
	this._debugName = '<Marker>';
	if (!options || (!options.target && !options.root)) throw new Error("'target' is a required option");
	init(this, options);
	this._state = assign(data$2(), options.data);

	this._handlers.destroy = [ondestroy$1];

	var _oncreate = oncreate$1.bind(this);

	if (!options.root) {
		this._oncreate = [_oncreate];
	} else {
	 	this.root._oncreate.push(_oncreate);
	 }

	this._fragment = create_main_fragment$2(this._state, this);

	if (options.target) {
		var nodes = children(options.target);
		options.hydrate ? this._fragment.l(nodes) : this._fragment.c();
		nodes.forEach(detachNode);
		this._fragment.m(options.target, options.anchor || null);

		callAll(this._oncreate);
	}
}

assign(Marker.prototype, protoDev);

Marker.prototype._checkReadOnly = function _checkReadOnly(newState) {
};

function deferred$2() {
  let _resolve, _reject;
  
  const later = new Promise((resolve, reject) => {
    _resolve = resolve;
    _reject = reject;
  });

  later.resolve = _resolve;
  later.reject = _reject;

  return later;
}

/* Users/junlapong/git-space/paksoi/packages/svelte-google-maps/Polyline.html generated by Svelte v1.51.0 */
function data$3() {
  return {
    polyline: deferred$2()
  };
}

async function oncreate$2() {
  const { map: context, path, color: strokeColor, weight: strokeWeight } = this.get();

  const { api, map } = await context.ready();
  const polyline = new api.Polyline({
    path,
    geodesic: true,
    strokeColor,
    strokeWeight
  });

  polyline.setMap(map);
  this.get('polyline').resolve(polyline);
}

async function ondestroy$2() {
  const polyline = await this.get('polyline');
  polyline.setMap(null);
}

function create_main_fragment$3(state, component) {

	return {
		c: noop,

		l: noop,

		m: noop,

		p: noop,

		u: noop,

		d: noop
	};
}

function Polyline(options) {
	this._debugName = '<Polyline>';
	if (!options || (!options.target && !options.root)) throw new Error("'target' is a required option");
	init(this, options);
	this._state = assign(data$3(), options.data);

	this._handlers.destroy = [ondestroy$2];

	var _oncreate = oncreate$2.bind(this);

	if (!options.root) {
		this._oncreate = [_oncreate];
	} else {
	 	this.root._oncreate.push(_oncreate);
	 }

	this._fragment = create_main_fragment$3(this._state, this);

	if (options.target) {
		var nodes = children(options.target);
		options.hydrate ? this._fragment.l(nodes) : this._fragment.c();
		nodes.forEach(detachNode);
		this._fragment.m(options.target, options.anchor || null);

		callAll(this._oncreate);
	}
}

assign(Polyline.prototype, protoDev);

Polyline.prototype._checkReadOnly = function _checkReadOnly(newState) {
};

/* Users/junlapong/git-space/paksoi/packages/svelte-google-maps/Info.html generated by Svelte v1.51.0 */
function data$4() {
  return {
    info: deferred$2()
  };
}

async function oncreate$3() {
  const { map: context, position } = this.get();
  const content = this.refs.content;

  const { api, map } = await context.ready();
  const info = new api.InfoWindow({
    content,
    position
  });

  info.addListener('closeclick', () => this.fire('close', info));

  this.observe('position', position => {
    info.setPosition(position);

    // If another InfoWindow is opened (e.g. Place)
    // then component may not have been destroyed
    // -> check for no map on position change, and re-open
    if (!info.map) info.open(map);
  }, { init: false });
  
  info.open(map);
  this.get('info').resolve(info);
}

async function ondestroy$3() {
  const info = await this.get('info');
  info.close();
}

function create_main_fragment$4(state, component) {
	var div, div_1, slot_content_default = component._slotted.default;

	return {
		c: function create() {
			div = createElement("div");
			div_1 = createElement("div");
		},

		l: function claim(nodes) {
			div = claimElement(nodes, "DIV", {}, false);
			var div_nodes = children(div);

			div_1 = claimElement(div_nodes, "DIV", {}, false);
			var div_1_nodes = children(div_1);

			div_1_nodes.forEach(detachNode);
			div_nodes.forEach(detachNode);
		},

		m: function mount(target, anchor) {
			insertNode(div, target, anchor);
			appendNode(div_1, div);

			if (slot_content_default) {
				appendNode(slot_content_default, div_1);
			}

			component.refs.content = div_1;
		},

		p: noop,

		u: function unmount() {
			detachNode(div);

			if (slot_content_default) {
				reinsertChildren(div_1, slot_content_default);
			}
		},

		d: function destroy$$1() {
			if (component.refs.content === div_1) component.refs.content = null;
		}
	};
}

function Info(options) {
	this._debugName = '<Info>';
	if (!options || (!options.target && !options.root)) throw new Error("'target' is a required option");
	init(this, options);
	this.refs = {};
	this._state = assign(data$4(), options.data);

	this._handlers.destroy = [ondestroy$3];

	this._slotted = options.slots || {};

	var _oncreate = oncreate$3.bind(this);

	if (!options.root) {
		this._oncreate = [_oncreate];
	} else {
	 	this.root._oncreate.push(_oncreate);
	 }

	this.slots = {};

	this._fragment = create_main_fragment$4(this._state, this);

	if (options.target) {
		var nodes = children(options.target);
		options.hydrate ? this._fragment.l(nodes) : this._fragment.c();
		nodes.forEach(detachNode);
		this._fragment.m(options.target, options.anchor || null);

		callAll(this._oncreate);
	}
}

assign(Info.prototype, protoDev);

Info.prototype._checkReadOnly = function _checkReadOnly(newState) {
};

//export const center = { lat: 37.552022, lng: -77.457849 };
const center = { lat: 13.515955, lng: 99.950190 };

const stations = [
  { position: { lat: 13.51403, lng: 99.944474 }, title: 'ส้มตำบ้านสวน' },
  { position: { lat: 13.521511, lng: 99.965059 }, title: 'ส้มตำย่าขา' },
  { position: { lat: 13.516737, lng: 99.952000 }, title: 'ร้านตาเข อาหารตามสั่ง' },
  { position: { lat: 13.530860, lng: 99.946921 }, title: 'Coco\'s Coffee' },
  { position: { lat: 13.519832, lng: 99.96068 }, title: 'The Peace Cafe x Hostel' },
  { position: { lat: 13.51989, lng: 99.95081 }, title: 'บุญ​ล้อม​ ก๋วยเตี๋ยว​ลง​สวน​' },
  { position: { lat: 13.499483, lng: 99.940575 }, title: 'Bamboo The Coffee Parlour' },
  { position: { lat: 13.515153, lng: 99.951543 }, title: 'ร้านข้าวมันไก่ไหหลำ เจ๊ยอง' },
  { position: { lat: 13.517824, lng: 99.953683 }, title: 'ก๋วยเตี๋ยวหมูน้ำแดง' },
  { position: { lat: 13.541078, lng: 99.964172 }, title: 'idyll coffee' },
  { position: { lat: 13.539581, lng: 99.965501 }, title: 'Tree Shade' },
  { position: { lat: 13.558011, lng: 99.968313 }, title: 'Take A Break' },
  { position: { lat: 13.489862, lng: 99.973928 }, title: 'ภพรักกาแฟ' },

  { position: { lat: 13.921234, lng: 100.667261 }, title: 'ก๋วยเตี๋ยวอาเล็ก เมืองทอง' },
  { position: { lat: 13.921252, lng: 100.667160 }, title: 'ตำมั่ว ครัวร้อยเอ็ด' }
];

const route = [
/*
  { lat: 37.58474, lng: -77.497187 },
  { lat: 37.580078, lng: -77.491633 },
  { lat: 37.565012, lng: -77.473562 },
  { lat: 37.563470, lng: -77.471716 },
  { lat: 37.561106, lng: -77.467761 },
  { lat: 37.557891, lng: -77.46244 },
  { lat: 37.550364, lng: -77.44993 },
  { lat: 37.546249, lng: -77.442877 },
  { lat: 37.543884, lng: -77.438993 },
  { lat: 37.540822, lng: -77.433908 },
  { lat: 37.538922, lng: -77.430607 },
  { lat: 37.538037, lng: -77.429316 },
  { lat: 37.535604, lng: -77.432020 },
  { lat: 37.534116, lng: -77.429588 },
  { lat: 37.529402, lng: -77.421734 },
  { lat: 37.527640, lng: -77.419059 },
  { lat: 37.525683, lng: -77.418501 },
  { lat: 37.52444, lng: -77.418544 },
  { lat: 37.522637, lng: -77.416956 },
  { lat: 37.520714, lng: -77.415991 },
  { lat: 37.517769, lng: -77.415787 }
*/
];

/* src/App.html generated by Svelte v1.51.0 */
const API_KEY = "AIzaSyD7oUvzDD-eXoWc91eECCa0eMHmHVZb1Cg";
const icon = {
  path: 'M 0,0 m -2,0 a 2,2 0 2,0 4,0 a 2,2 0 2,0 -4,0',
  fillColor: '#ff3d00',
  fillOpacity: 1,
  scale: 3,
  strokeColor: '#ff3d00',
  strokeWeight: 2.5
};

function data() {
  return {
    map: new Context(API_KEY, { beta: true }),
    center,
    zoom: 14,
    stations,
    route,
    icon,
    selected: null
  };
}

function encapsulateStyles(node) {
	setAttribute(node, "svelte-1042066063", "");
}

function create_main_fragment(state, component) {
	var div, div_1, text, each_anchor, text_1, text_2, if_block_anchor, text_3, map_updating = {}, text_6, div_2, div_3, text_7, text_8_value = state.center.lat.toFixed(6), text_8, text_9, span, text_10, text_11, div_4, text_12, text_13_value = state.center.lng.toFixed(6), text_13, text_14, span_1, text_15, text_16, div_5, label, text_17, text_18, input, text_19, text_20;

	var stations_1 = state.stations;

	var each_blocks = [];

	for (var i = 0; i < stations_1.length; i += 1) {
		each_blocks[i] = create_each_block(state, stations_1, stations_1[i], i, component);
	}

	var polyline = new Polyline({
		root: component.root,
		data: {
			map: state.map,
			path: state.route,
			color: "#005da5",
			weight: 4
		}
	});

	var if_block = (state.selected) && create_if_block(state, component);

	var map_initial_data = { map: state.map, defer: true };
	if ('center' in state) {
		map_initial_data.center = state.center ;
		map_updating.center = true;
	}
	if ('zoom' in state) {
		map_initial_data.zoom = state.zoom;
		map_updating.zoom = true;
	}
	var map = new Map({
		root: component.root,
		slots: { default: createFragment() },
		data: map_initial_data,
		_bind: function(changed, childState) {
			var state = component.get(), newState = {};
			if (!map_updating.center && changed.center) {
				newState.center = childState.center;
			}

			if (!map_updating.zoom && changed.zoom) {
				newState.zoom = childState.zoom;
			}
			map_updating = assign({}, changed);
			component._set(newState);
			map_updating = {};
		}
	});

	component.root._beforecreate.push(function() {
		var state = component.get(), childState = map.get(), newState = {};
		if (!childState) return;
		if (!map_updating.center) {
			newState.center = childState.center;
		}

		if (!map_updating.zoom) {
			newState.zoom = childState.zoom;
		}
		map_updating = { center: true, zoom: true };
		component._set(newState);
		map_updating = {};
	});

	function input_input_handler() {
		component.set({ zoom: toNumber(input.value) });
	}

	function input_change_handler() {
		component.set({ zoom: toNumber(input.value) });
	}

	return {
		c: function create() {
			div = createElement("div");
			div_1 = createElement("div");
			text = createText("\n      ");

			for (var i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].c();
			}

			each_anchor = createComment();
			text_1 = createText("\n\n      ");
			polyline._fragment.c();
			text_2 = createText("\n\n      ");
			if (if_block) if_block.c();
			if_block_anchor = createComment();
			text_3 = createText("\n    ");
			map._fragment.c();
			text_6 = createText("\n\n");
			div_2 = createElement("div");
			div_3 = createElement("div");
			text_7 = createText("Latitude: ");
			text_8 = createText(text_8_value);
			text_9 = createText("\n  ");
			span = createElement("span");
			text_10 = createText("—");
			text_11 = createText("\n  ");
			div_4 = createElement("div");
			text_12 = createText("Longitude: ");
			text_13 = createText(text_13_value);
			text_14 = createText("\n  ");
			span_1 = createElement("span");
			text_15 = createText("—");
			text_16 = createText("\n  ");
			div_5 = createElement("div");
			label = createElement("label");
			text_17 = createText("Zoom");
			text_18 = createText(":\n    ");
			input = createElement("input");
			text_19 = createText(" ");
			text_20 = createText(state.zoom);
			this.h();
		},

		l: function claim(nodes) {
			div = claimElement(nodes, "DIV", { class: true }, false);
			var div_nodes = children(div);

			div_1 = claimElement(div_nodes, "DIV", { class: true }, false);
			var div_1_nodes = children(div_1);

			text = claimText(nodes, "\n      ");

			for (var i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].l(nodes);
			}

			each_anchor = createComment();
			text_1 = claimText(nodes, "\n\n      ");
			polyline._fragment.l(nodes);
			text_2 = claimText(nodes, "\n\n      ");
			if (if_block) if_block.l(nodes);
			if_block_anchor = createComment();
			text_3 = claimText(nodes, "\n    ");
			map._fragment.l(div_1_nodes);
			div_1_nodes.forEach(detachNode);
			div_nodes.forEach(detachNode);
			text_6 = claimText(nodes, "\n\n");

			div_2 = claimElement(nodes, "DIV", { class: true }, false);
			var div_2_nodes = children(div_2);

			div_3 = claimElement(div_2_nodes, "DIV", { class: true }, false);
			var div_3_nodes = children(div_3);

			text_7 = claimText(div_3_nodes, "Latitude: ");
			text_8 = claimText(div_3_nodes, text_8_value);
			div_3_nodes.forEach(detachNode);
			text_9 = claimText(div_2_nodes, "\n  ");

			span = claimElement(div_2_nodes, "SPAN", { class: true }, false);
			var span_nodes = children(span);

			text_10 = claimText(span_nodes, "—");
			span_nodes.forEach(detachNode);
			text_11 = claimText(div_2_nodes, "\n  ");

			div_4 = claimElement(div_2_nodes, "DIV", { class: true }, false);
			var div_4_nodes = children(div_4);

			text_12 = claimText(div_4_nodes, "Longitude: ");
			text_13 = claimText(div_4_nodes, text_13_value);
			div_4_nodes.forEach(detachNode);
			text_14 = claimText(div_2_nodes, "\n  ");

			span_1 = claimElement(div_2_nodes, "SPAN", { class: true }, false);
			var span_1_nodes = children(span_1);

			text_15 = claimText(span_1_nodes, "—");
			span_1_nodes.forEach(detachNode);
			text_16 = claimText(div_2_nodes, "\n  ");

			div_5 = claimElement(div_2_nodes, "DIV", { class: true }, false);
			var div_5_nodes = children(div_5);

			label = claimElement(div_5_nodes, "LABEL", { for: true }, false);
			var label_nodes = children(label);

			text_17 = claimText(label_nodes, "Zoom");
			label_nodes.forEach(detachNode);
			text_18 = claimText(div_5_nodes, ":\n    ");

			input = claimElement(div_5_nodes, "INPUT", { type: true, min: true, max: true, class: true }, false);
			var input_nodes = children(input);

			input_nodes.forEach(detachNode);
			text_19 = claimText(div_5_nodes, " ");
			text_20 = claimText(div_5_nodes, state.zoom);
			div_5_nodes.forEach(detachNode);
			div_2_nodes.forEach(detachNode);
			this.h();
		},

		h: function hydrate() {
			encapsulateStyles(div_1);
			setAttribute(div_1, "svelte-ref-container", "");
			div_1.className = "w-full border-b border-grey border-solid";
			div.className = "sm:flex border border-grey border-solid";
			div_3.className = "sm:inline-block";
			span.className = "invisible sm:visible";
			div_4.className = "sm:inline-block";
			span_1.className = "invisible sm:visible";
			label.htmlFor = "zoom";
			addListener(input, "input", input_input_handler);
			addListener(input, "change", input_change_handler);
			input.type = "range";
			input.min = "1";
			input.max = "18";
			input.className = "align-text-top";
			div_5.className = "sm:inline-block";
			div_2.className = "my-4 text-grey-darker text-sm sm:text-right";
		},

		m: function mount(target, anchor) {
			insertNode(div, target, anchor);
			appendNode(div_1, div);
			appendNode(text, map._slotted.default);

			for (var i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].m(map._slotted.default, null);
			}

			appendNode(each_anchor, map._slotted.default);
			appendNode(text_1, map._slotted.default);
			polyline._mount(map._slotted.default, null);
			appendNode(text_2, map._slotted.default);
			if (if_block) if_block.m(map._slotted.default, null);
			appendNode(if_block_anchor, map._slotted.default);
			appendNode(text_3, map._slotted.default);
			map._mount(div_1, null);
			component.refs.container = div_1;
			insertNode(text_6, target, anchor);
			insertNode(div_2, target, anchor);
			appendNode(div_3, div_2);
			appendNode(text_7, div_3);
			appendNode(text_8, div_3);
			appendNode(text_9, div_2);
			appendNode(span, div_2);
			appendNode(text_10, span);
			appendNode(text_11, div_2);
			appendNode(div_4, div_2);
			appendNode(text_12, div_4);
			appendNode(text_13, div_4);
			appendNode(text_14, div_2);
			appendNode(span_1, div_2);
			appendNode(text_15, span_1);
			appendNode(text_16, div_2);
			appendNode(div_5, div_2);
			appendNode(label, div_5);
			appendNode(text_17, label);
			appendNode(text_18, div_5);
			appendNode(input, div_5);

			input.value = state.zoom;

			appendNode(text_19, div_5);
			appendNode(text_20, div_5);
		},

		p: function update(changed, state) {
			var stations_1 = state.stations;

			if (changed.map || changed.stations || changed.icon) {
				for (var i = 0; i < stations_1.length; i += 1) {
					if (each_blocks[i]) {
						each_blocks[i].p(changed, state, stations_1, stations_1[i], i);
					} else {
						each_blocks[i] = create_each_block(state, stations_1, stations_1[i], i, component);
						each_blocks[i].c();
						each_blocks[i].m(each_anchor.parentNode, each_anchor);
					}
				}

				for (; i < each_blocks.length; i += 1) {
					each_blocks[i].u();
					each_blocks[i].d();
				}
				each_blocks.length = stations_1.length;
			}

			var polyline_changes = {};
			if (changed.map) polyline_changes.map = state.map;
			if (changed.route) polyline_changes.path = state.route;
			polyline._set(polyline_changes);

			if (state.selected) {
				if (if_block) {
					if_block.p(changed, state);
				} else {
					if_block = create_if_block(state, component);
					if_block.c();
					if_block.m(if_block_anchor.parentNode, if_block_anchor);
				}
			} else if (if_block) {
				if_block.u();
				if_block.d();
				if_block = null;
			}

			var map_changes = {};
			if (changed.map) map_changes.map = state.map;
			if (!map_updating.center && changed.center) {
				map_changes.center = state.center ;
				map_updating.center = true;
			}
			if (!map_updating.zoom && changed.zoom) {
				map_changes.zoom = state.zoom;
				map_updating.zoom = true;
			}
			map._set(map_changes);
			map_updating = {};

			if ((changed.center) && text_8_value !== (text_8_value = state.center.lat.toFixed(6))) {
				text_8.data = text_8_value;
			}

			if ((changed.center) && text_13_value !== (text_13_value = state.center.lng.toFixed(6))) {
				text_13.data = text_13_value;
			}

			input.value = state.zoom;
			input.value = state.zoom;
			if (changed.zoom) {
				text_20.data = state.zoom;
			}
		},

		u: function unmount() {
			detachNode(div);

			for (var i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].u();
			}

			if (if_block) if_block.u();
			detachNode(text_6);
			detachNode(div_2);
		},

		d: function destroy$$1() {
			destroyEach(each_blocks);

			polyline.destroy(false);
			if (if_block) if_block.d();
			map.destroy(false);
			if (component.refs.container === div_1) component.refs.container = null;
			removeListener(input, "input", input_input_handler);
			removeListener(input, "change", input_change_handler);
		}
	};
}

// (9:6) {{#each stations as station}}
function create_each_block(state, stations_1, station, station_index, component) {

	var marker = new Marker({
		root: component.root,
		data: {
			map: state.map,
			position: station.position,
			title: station.title,
			icon: state.icon
		}
	});

	marker.on("click", function(event) {
		var stations_1 = marker_context.stations_1, station_index = marker_context.station_index, station = stations_1[station_index];

		component.set({ selected: station });
	});

	var marker_context = {
		stations_1: stations_1,
		station_index: station_index
	};

	return {
		c: function create() {
			marker._fragment.c();
		},

		l: function claim(nodes) {
			marker._fragment.l(nodes);
		},

		m: function mount(target, anchor) {
			marker._mount(target, anchor);
		},

		p: function update(changed, state, stations_1, station, station_index) {
			var marker_changes = {};
			if (changed.map) marker_changes.map = state.map;
			if (changed.stations) marker_changes.position = station.position;
			if (changed.stations) marker_changes.title = station.title;
			if (changed.icon) marker_changes.icon = state.icon;
			marker._set(marker_changes);

			marker_context.stations_1 = stations_1;
			marker_context.station_index = station_index;
		},

		u: function unmount() {
			marker._unmount();
		},

		d: function destroy$$1() {
			marker.destroy(false);
		}
	};
}

// (15:6) {{#if selected}}
function create_if_block(state, component) {
	var text, div, text_1_value = state.selected.title, text_1, text_2;

	var info = new Info({
		root: component.root,
		slots: { default: createFragment() },
		data: { map: state.map, position: state.selected.position }
	});

	info.on("close", function(event) {
		component.set({ selected: null });
	});

	return {
		c: function create() {
			text = createText("\n          ");
			div = createElement("div");
			text_1 = createText(text_1_value);
			text_2 = createText("\n        ");
			info._fragment.c();
			this.h();
		},

		l: function claim(nodes) {
			text = claimText(nodes, "\n          ");

			div = claimElement(nodes, "DIV", { class: true }, false);
			var div_nodes = children(div);

			text_1 = claimText(div_nodes, text_1_value);
			div_nodes.forEach(detachNode);
			text_2 = claimText(nodes, "\n        ");
			info._fragment.l(nodes);
			this.h();
		},

		h: function hydrate() {
			div.className = "text-sm font-medium whitespace-no-wrap";
		},

		m: function mount(target, anchor) {
			appendNode(text, info._slotted.default);
			appendNode(div, info._slotted.default);
			appendNode(text_1, div);
			appendNode(text_2, info._slotted.default);
			info._mount(target, anchor);
		},

		p: function update(changed, state) {
			if ((changed.selected) && text_1_value !== (text_1_value = state.selected.title)) {
				text_1.data = text_1_value;
			}

			var info_changes = {};
			if (changed.map) info_changes.map = state.map;
			if (changed.selected) info_changes.position = state.selected.position;
			info._set(info_changes);
		},

		u: function unmount() {
			info._unmount();
		},

		d: function destroy$$1() {
			info.destroy(false);
		}
	};
}

function App(options) {
	this._debugName = '<App>';
	if (!options || (!options.target && !options.root)) throw new Error("'target' is a required option");
	init(this, options);
	this.refs = {};
	this._state = assign(data(), options.data);
	if (!('map' in this._state)) console.warn("<App> was created without expected data property 'map'");
	if (!('center' in this._state)) console.warn("<App> was created without expected data property 'center'");
	if (!('zoom' in this._state)) console.warn("<App> was created without expected data property 'zoom'");
	if (!('stations' in this._state)) console.warn("<App> was created without expected data property 'stations'");
	if (!('icon' in this._state)) console.warn("<App> was created without expected data property 'icon'");
	if (!('route' in this._state)) console.warn("<App> was created without expected data property 'route'");
	if (!('selected' in this._state)) console.warn("<App> was created without expected data property 'selected'");

	if (!options.root) {
		this._oncreate = [];
		this._beforecreate = [];
		this._aftercreate = [];
	}

	this._fragment = create_main_fragment(this._state, this);

	if (options.target) {
		var nodes = children(options.target);
		options.hydrate ? this._fragment.l(nodes) : this._fragment.c();
		nodes.forEach(detachNode);
		this._fragment.m(options.target, options.anchor || null);

		this._lock = true;
		callAll(this._beforecreate);
		callAll(this._oncreate);
		callAll(this._aftercreate);
		this._lock = false;
	}
}

assign(App.prototype, protoDev);

App.prototype._checkReadOnly = function _checkReadOnly(newState) {
};

const app = new App({
  target: document.getElementById('example')
});

return app;

}());
//# sourceMappingURL=bundle.js.map
