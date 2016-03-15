# Overlapping Feature Spiderfier

### This is a version of https://github.com/jawj/OverlappingMarkerSpiderfier/ by [George MacKerron] (https://github.com/jawj/) that can be used with [Google Maps Data Layers] (https://developers.google.com/maps/documentation/javascript/datalayer), instead of the standard Markers that the original library worked with.  

**It has been written in TypeScript rather than CoffeeScript, but the compiled JS can be downloaded from https://github.com/slovely/OverlappingFeatureSpiderfier/blob/master/build/OverlappingFeatureSpiderfier.js**

*If you are adding `google.maps.Marker` objects to your map then you should use the original library.*

*If you are adding `google.maps.Data.Feature` objects (with geometry type of `Point`), then you can use this library.*

As per the original library, this code will allow overlapping Point Features to "spiderfy" when clicked.

## How to use

Create your map like normal:

```
var gm = google.maps;
var map = new gm.Map(document.getElementById('map_canvas'), {
  mapTypeId: gm.MapTypeId.SATELLITE,
  center: new gm.LatLng(50, 0), 
  zoom: 6
});
```

Create an OverlappingFeatureSpiderfier instance, passing in a google.maps.Data instance:

```
var ofs = new OverlappingFeatureSpiderfier(map.data);
```

**If you have more than one layer and you want all features to be spiderfied, pass in an array of layers instead like this:
```
var ofs = new OverlappingFeatureSpiderfier([myFirstLayer, mySecondLayer]);
```


Add a click handler to the OverlappingFeatureSpiderfier instance.  The function will be passed the raised google.maps.Data.MouseEvent object:

```
ofs.addListener("click", function(event) {
  var theFeatureThatWasClicked = event.feature;
});
```

You can also add listeners on the `spiderfy` and `unspiderfy` events, which will be passed an array of the features affected.

```
ofs.addListener('spiderfy', function(features) {
});
ofs.addListener('unspiderfy', function(features) {
});
```

Unlike the original library, you **do not** need to tell the OverlappingFeatureSpiderfier when features are added or removed from the Data Layer, as
the OverlappingFeatureSpiderfier will subscribe to the `addfeature` and `removefeature` events.

## DOCS

*Most of the options for the original library are supported, and are copied here for reference.*.  Differences are highlighted in **BOLD**

### Construction

```
new OverlappingFeatureSpiderfier(data, options)
```

Creates an instance associated with `data` (a `google.maps.Data` object).

The `options` argument is an optional `Object` specifying any options you want changed from their defaults. The available options are:

*markersWontMove* and *markersWontHide* (defaults: `false`)

**Data Layer Features do not have a built-in 'visible' property - this library assumes that all features have such a property set to a true/false value
using the `setProperty` function.**

By default, change events for each added features `geometry` and visible property are observed (so that, if a spiderfied feature is moved or hidden, all spiderfied markers are unspiderfied, and the new position is respected where applicable).

However, if you know that you won't be moving and/or hiding any of the features you add to this instance, you can save memory (a closure per feature in each case) by setting the options named `markersWontMove` and/or `markersWontHide` to `true` (or anything "truthy":http://isolani.co.uk/blog/javascript/TruthyFalsyAndTypeCasting).

For example, `var oms = new OverlappingFeatureSpiderfier(map.data, {markersWontMove: true, markersWontHide: true});`

*keepSpiderfied* (default: `false`)

By default, the OverlappingFeatureSpiderfier works like Google Earth, in that when you click a spiderfied feature, the markers unspiderfy before any other action takes place. 

Since this can make it tricky for the user to work through a set of markers one by one, you can override this behaviour by setting the `keepSpiderfied` option to `true`.

*nearbyDistance* (default: `20`).

This is the pixel radius within which a feature is considered to be overlapping a clicked feature.

*circleSpiralSwitchover* (default: `9`)

This is the lowest number of features that will be fanned out into a spiral instead of a circle. Set this to `0` to always get spirals, or `Infinity` for all circles.

*legWeight* (default: `1.5`) 

This determines the thickness of the lines joining spiderfied features to their original locations. 

### Instance methods: managing features

*addMarker(marker)*

**Not required in this version**

*removeMarker(marker)*

**Not required in this version**

*clearMarkers()*

** Not required in this version**

*getMarkers()*

**Not implemented**

### Instance methods: managing listeners

*addListener(event, listenerFunc)*

Adds a listener to react to one of three events.

`event` may be `'click'`, `'spiderfy'` or `'unspiderfy'`.

For `'click'` events, `listenerFunc` receives one argument: the google.maps.Data.MouseEvent object. You'll probably want to use this listener to do something like show a @google.maps.InfoWindow@.

For `'spiderfy'` or `'unspiderfy'` events, `listenerFunc` receives two arguments: first, an array of the features that were spiderfied or unspiderfied; second, an array of the features that were not. One use for these listeners is to make some distinction between spiderfied and non-spiderfied features when some features are spiderfied -- e.g. highlighting those that are features, or dimming out those that aren't.

*removeListener(event, listenerFunc)*

Removes the specified listener on the specified event.

*clearListeners(event)*

Removes all listeners on the specified event.

*unspiderfy()*

Returns any spiderfied features to their original positions, and triggers any listeners you may have set for this event. Unless no features are spiderfied, in which case it does nothing.


h3. Instance methods: advanced use only!

*markersNearMarker(feature, firstOnly)*

Returns an array of features within `nearbyDistance` pixels of `feature` -- i.e. those that will be spiderfied when `features` is clicked. If you pass `true` as the second argument, the search will stop when a single feature has been found. This is more efficient if all you want to know is whether there are any nearby features.

_Don't_ call this method in a loop over all your features, since this can take a _very_ long time.

The return value of this method may change any time the zoom level changes, and when any feature is added, moved, hidden or removed. Hence you'll very likely want call it (and take appropriate action) every time the map's `zoom_changed` event fires _and_ any time you add, move, hide or remove a feature.

Note also that this method relies on the map's `Projection` object being available, and thus cannot be called until the map's first `idle` event fires.

*markersNearAnyOtherMarker()*

Returns an array of all features that are near one or more other features -- i.e. those will be spiderfied when clicked.

This method is several orders of magnitude faster than looping over all features calling `markersNearMarker` (primarily because it only does the expensive business of converting lat/lons to pixel coordinates once per feature).

The return value of this method may change any time the zoom level changes, and when any feature is added, moved, hidden or removed. Hence you'll very likely want call it (and take appropriate action) every time the map's `zoom_changed` event fires _and_ any time you add, move, hide or remove a feature.

Note also that this method relies on the map's `Projection` object being available, and thus cannot be called until the map's first `idle` event fires.


### Properties

You can set the following properties on an OverlappingFeatureSpiderfier instance:

*legColors.usual[mapType]* and *legColors.highlighted[mapType]*

These determine the usual and highlighted colours of the lines, where `mapType` is one of the `google.maps.MapTypeId` constants ("or a custom map type ID":https://github.com/jawj/OverlappingMarkerSpiderfier/issues/4). 

The defaults are as follows:
```
var mti = google.maps.MapTypeId;
legColors.usual[mti.HYBRID] = legColors.usual[mti.SATELLITE] = '#fff';
legColors.usual[mti.TERRAIN] = legColors.usual[mti.ROADMAP] = '#444';
legColors.highlighted[mti.HYBRID] = legColors.highlighted[mti.SATELLITE] = legColors.highlighted[mti.TERRAIN] = legColors.highlighted[mti.ROADMAP] = '#f00';
```

You can also get and set any of the options noted in the constructor function documentation above as properties on an OverlappingFeatureSpiderfier instance. However, for some of these options (e.g. `markersWontMove`) modifications won't be applied retroactively.

## Contributors
<sub>(these are people that have contributed to *this* version - many more contributed to the original).</sub>

- Simon Lovely (https://github.com/slovely)
- Brad Zacher (https://github.com/bradzacher)

## Licence

As per the original library, this software is released under the "MIT licence":http://www.opensource.org/licenses/mit-license.php.

**THE ORIGINAL AUTHOR OF THIS LIBRARY IS ON GITTIP, please direct thanks to him: https://www.gittip.com/jawj.**
 
