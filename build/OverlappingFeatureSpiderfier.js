var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    __.prototype = b.prototype;
    d.prototype = new __();
};
var OverlappingFeatureSpiderfier = (function () {
    function OverlappingFeatureSpiderfier(layer, options) {
        var _this = this;
        if (options === void 0) { options = null; }
        this.layer = layer;
        this.options = options;
        this.markers = [];
        this.nearbyDistance = 20;
        this.keepSpiderfied = false;
        this.markersWontMove = false;
        this.markersWontHide = false;
        this.twoPi = Math.PI * 2;
        this.circleSpiralSwitchover = 9;
        this.circleFootSeparation = 23;
        this.circleStartAngle = this.twoPi / 12;
        this.spiralFootSeparation = 26;
        this.spiralLengthStart = 11;
        this.spiralLengthFactor = 4;
        this.usualLegZIndex = 10;
        this.legWeight = 1.5;
        this.legColors = {
            usual: {},
            highlighted: {}
        };
        this.lcH = this.legColors.highlighted;
        this.lcU = this.legColors.usual;
        this.listeners = [];
        this.ptDistanceSq = function (pt1, pt2) {
            var dx, dy;
            dx = pt1.x - pt2.x;
            dy = pt1.y - pt2.y;
            return dx * dx + dy * dy;
        };
        this.ptAverage = function (pts) {
            var numPts, sumX, sumY;
            sumX = sumY = 0;
            pts.forEach(function (pt) {
                sumX += pt.x;
                return sumY += pt.y;
            });
            numPts = pts.length;
            return new google.maps.Point(sumX / numPts, sumY / numPts);
        };
        this.minExtract = function (set, func) {
            var bestIndex, bestVal, index, item, val, _i, _len;
            for (index = _i = 0, _len = set.length; _i < _len; index = ++_i) {
                item = set[index];
                val = func(item);
                if ((typeof bestIndex === "undefined" || bestIndex === null) || val < bestVal) {
                    bestVal = val;
                    bestIndex = index;
                }
            }
            return set.splice(bestIndex, 1)[0];
        };
        this.lcU[google.maps.MapTypeId.HYBRID] = this.lcU[google.maps.MapTypeId.SATELLITE] = "#fff";
        this.lcH[google.maps.MapTypeId.HYBRID] = this.lcH[google.maps.MapTypeId.SATELLITE] = "#f00";
        this.lcU[google.maps.MapTypeId.TERRAIN] = this.lcU[google.maps.MapTypeId.ROADMAP] = "#444";
        this.lcH[google.maps.MapTypeId.TERRAIN] = this.lcH[google.maps.MapTypeId.ROADMAP] = "#f00";
        // Update the default options with those passed in
        for (var opt in options) {
            if (!options.hasOwnProperty(opt))
                continue;
            this[opt] = options[opt];
        }
        // Setup event handlers for click/add/remove features
        layer.addListener("click", function (e) { return _this.processClick(e); });
        layer.addListener("addfeature", function (e) { return _this.featureAdded(e); });
        layer.addListener("removefeature", function (e) { return _this.featureRemoved(e); });
        // Listen to mouse out/over events so we can un/highlight spiderfied legs.
        layer.addListener("mouseout", function (e) { return _this.featureMouseOut(e); });
        layer.addListener("mouseover", function (e) { return _this.featureMouseOver(e); });
        // Setup event handlers for features moving or being hidden (if required)
        if (!this.markersWontHide) {
            layer.addListener("setgeometry", function (e) { return _this.markerChangeListener(e.feature, false); });
        }
        if (!this.markersWontMove) {
            layer.addListener("setproperty", function (e) {
                // Only interested in 'visible' property
                if (e.name === "visible") {
                    _this.markerChangeListener(e.feature, false);
                }
            });
        }
        // Add any existing features on the layer
        layer.forEach(function (f) { return _this.addFeature(f); });
        this.map = layer.getMap();
        // We need the layer to already have it's map set
        if (!this.map)
            throw "Layer map should be set before instantiating OverlappingFeatureSpiderfy!";
        this.projHelper = new ProjHelper(this.map);
        // unspiderfy when the map is clicked/changed
        ["click", "zoom_changed", "maptypeid_changed"].forEach(function (e) { return google.maps.event.addListener(_this.map, e, function () { return _this.unspiderfy(); }); });
    }
    OverlappingFeatureSpiderfier.prototype.addListener = function (event, func) {
        var _base;
        ((_base = this.listeners)[event] != null ? (_base = this.listeners)[event] : _base[event] = []).push(func);
        return this;
    };
    OverlappingFeatureSpiderfier.prototype.removeListener = function (event, func) {
        var i;
        i = this.arrIndexOf(this.listeners[event], func);
        if (!(i < 0)) {
            this.listeners[event].splice(i, 1);
        }
        return this;
    };
    OverlappingFeatureSpiderfier.prototype.clearListeners = function (event) {
        this.listeners[event] = [];
        return this;
    };
    OverlappingFeatureSpiderfier.prototype.markersNearMarker = function (marker, firstOnly) {
        if (firstOnly === void 0) { firstOnly = false; }
        if (this.projHelper.getProjection() == null) {
            throw "Must wait for 'idle' event on map before calling markersNearMarker";
        }
        var nDist = this.nearbyDistance;
        var pxSq = nDist * nDist;
        var geo = marker.getGeometry();
        if (geo.getType() !== 'Point')
            return [];
        var markerPt = this.llToPt(geo.get());
        var markers = [];
        for (var i = 0, len = this.markers.length; i < len; i++) {
            var m = this.markers[i];
            geo = m.getGeometry();
            if (geo.getType() !== 'Point')
                continue;
            var pos = geo.get();
            if (m === marker || (m.getProperty("visible") === false)) {
                continue;
            }
            var mPt = this.llToPt(m._omsData != null ? (m._omsData.usualPosition || pos) : pos);
            if (this.ptDistanceSq(mPt, markerPt) < pxSq) {
                markers.push(m);
                if (firstOnly) {
                    break;
                }
            }
        }
        return markers;
    };
    OverlappingFeatureSpiderfier.prototype.markersNearAnyOtherMarker = function () {
        var _this = this;
        if (this.projHelper.getProjection() == null) {
            throw "Must wait for 'idle' event on map before calling markersNearAnyOtherMarker";
        }
        var nDist = this.nearbyDistance;
        var pxSq = nDist * nDist;
        var mData = this.markers.map(function (m) {
            var geo = m.getGeometry();
            var pos = geo.get();
            return {
                pt: _this.llToPt(m._omsData != null ? (m._omsData.usualPosition || pos) : pos),
                willSpiderfy: false
            };
        });
        for (var i = 0, len = this.markers.length; i < len; ++i) {
            var m1 = this.markers[i];
            if (m1.getProperty("visible") === false) {
                continue;
            }
            var m1Data = mData[i];
            if (m1Data.willSpiderfy) {
                continue;
            }
            for (var j = 0; j < len; ++j) {
                var m2 = this.markers[j];
                if (i === j) {
                    continue;
                }
                if (m2.getProperty("visible") === false) {
                    continue;
                }
                var m2Data = mData[j];
                if (j < i && !m2Data.willSpiderfy) {
                    continue;
                }
                if (this.ptDistanceSq(m1Data.pt, m2Data.pt) < pxSq) {
                    m1Data.willSpiderfy = m2Data.willSpiderfy = true;
                    break;
                }
            }
        }
        var results = [];
        for (var k = 0; k < this.markers.length; ++k) {
            var m = this.markers[k];
            if (mData[k].willSpiderfy) {
                results.push(m);
            }
        }
        return results;
    };
    OverlappingFeatureSpiderfier.prototype.trigger = function (event) {
        var args = [];
        for (var _a = 1; _a < arguments.length; _a++) {
            args[_a - 1] = arguments[_a];
        }
        var _ref1;
        return ((_ref1 = this.listeners[event]) != null ? _ref1 : []).map(function (func) { return func.apply(null, args); });
    };
    OverlappingFeatureSpiderfier.prototype.markerChangeListener = function (marker, positionChanged) {
        if (this.markers.indexOf(marker) === -1)
            return this;
        if ((marker._omsData != null) && (positionChanged || !marker.getProperty("visible")) && !(this.spiderfying != null || this.unspiderfying != null)) {
            return this.unspiderfy(positionChanged ? marker : null);
        }
    };
    OverlappingFeatureSpiderfier.prototype.unspiderfy = function (markerNotToMove) {
        if (markerNotToMove === void 0) { markerNotToMove = null; }
        if (this.spiderfied == null) {
            return this;
        }
        this.unspiderfying = true;
        var unspiderfiedMarkers = [];
        var nonNearbyMarkers = [];
        this.markers.forEach(function (marker) {
            if (marker._omsData != null) {
                marker._omsData.leg.setMap(null);
                if (marker !== markerNotToMove) {
                    marker.setGeometry(new google.maps.Data.Point(marker._omsData.usualPosition));
                }
                delete marker["_omsData"];
                return unspiderfiedMarkers.push(marker);
            }
            else {
                return nonNearbyMarkers.push(marker);
            }
        });
        delete this.unspiderfying;
        delete this.spiderfied;
        this.trigger("unspiderfy", unspiderfiedMarkers, nonNearbyMarkers);
        return this;
    };
    OverlappingFeatureSpiderfier.prototype.spiderfy = function (markerData, nonNearbyMarkers) {
        var _this = this;
        var bodyPt, footLl, footPts, leg, nearestMarkerDatum, numFeet, spiderfiedMarkers;
        this.spiderfying = true;
        numFeet = markerData.length;
        bodyPt = this.ptAverage(markerData.map(function (md) { return md.markerPt; }));
        footPts = numFeet >= this["circleSpiralSwitchover"] ? this.generatePtsSpiral(numFeet, bodyPt).reverse() : this.generatePtsCircle(numFeet, bodyPt);
        spiderfiedMarkers = footPts.map(function (footPt) {
            footLl = _this.ptToLl(footPt);
            nearestMarkerDatum = _this.minExtract(markerData, function (md) { return _this.ptDistanceSq(md.markerPt, footPt); });
            var marker = nearestMarkerDatum.marker, as = IExtendedFeature;
            leg = new google.maps.Polyline({
                map: _this.map,
                path: [marker.getGeometry().get(), footLl],
                strokeColor: _this.legColors.usual[_this.map.getMapTypeId()],
                strokeWeight: _this.legWeight,
                zIndex: _this.usualLegZIndex
            });
            marker._omsData = {
                usualPosition: marker.getGeometry().get(),
                leg: leg
            };
            marker.setGeometry(new google.maps.Data.Point(footLl));
            return marker;
        });
        delete this.spiderfying;
        this.spiderfied = true;
        return this.trigger("spiderfy", spiderfiedMarkers, nonNearbyMarkers);
    };
    OverlappingFeatureSpiderfier.prototype.featureMouseOut = function (e) {
        var feature = e.feature, as = IExtendedFeature;
        if (feature._omsData != null && feature._omsData.leg != null) {
            feature._omsData.leg.setOptions({
                strokeColor: this.legColors.usual[this.map.getMapTypeId()],
                zIndex: this["usualLegZIndex"]
            });
        }
    };
    OverlappingFeatureSpiderfier.prototype.featureMouseOver = function (e) {
        var feature = e.feature, as = IExtendedFeature;
        if (feature._omsData != null && feature._omsData.leg != null) {
            feature._omsData.leg.setOptions({
                strokeColor: this.legColors.highlighted[this.map.getMapTypeId()],
                zIndex: this["highlightedLegZIndex"]
            });
        }
    };
    OverlappingFeatureSpiderfier.prototype.processClick = function (event) {
        if (!event.feature["_oms"])
            return;
        var marker = event.feature;
        var geo = marker.getGeometry(), as = google.maps.Data.Point;
        // Only interested in 'Point' features
        if (geo.getType() !== "Point")
            return;
        var mPt, markerPt, markerSpiderfied, nDist, nearbyMarkerData, nonNearbyMarkers, pxSq, _i, _len;
        markerSpiderfied = marker["_omsData"] != null;
        if (!(markerSpiderfied && this.keepSpiderfied)) {
            this.unspiderfy();
        }
        if (markerSpiderfied || this.map.getStreetView().getVisible() || this.map.getMapTypeId() === "GoogleEarthAPI") {
            return this.trigger("click", event);
        }
        else {
            nearbyMarkerData = [];
            nonNearbyMarkers = [];
            nDist = this.nearbyDistance;
            pxSq = nDist * nDist;
            markerPt = this.llToPt(geo.get());
            for (_i = 0, _len = this.markers.length; _i < _len; _i++) {
                var m = this.markers[_i];
                var geo_1 = m.getGeometry(), as_1 = google.maps.Data.Point;
                if (geo_1.getType() !== "Point")
                    continue;
                ;
                if (!m.getProperty("visible")) {
                    continue;
                }
                mPt = this.llToPt(geo_1.get());
                if (this.ptDistanceSq(mPt, markerPt) < pxSq) {
                    nearbyMarkerData.push({
                        marker: m,
                        markerPt: mPt
                    });
                }
                else {
                    nonNearbyMarkers.push(m);
                }
            }
            if (nearbyMarkerData.length === 1) {
                return this.trigger("click", event);
            }
            else {
                return this.spiderfy(nearbyMarkerData, nonNearbyMarkers);
            }
        }
    };
    OverlappingFeatureSpiderfier.prototype.featureAdded = function (evt) {
        this.addFeature(evt.feature);
    };
    OverlappingFeatureSpiderfier.prototype.addFeature = function (feature) {
        if (feature.getGeometry().getType() !== "Point")
            return;
        if (feature._oms)
            return;
        feature._oms = true;
        this.markers.push(feature);
    };
    OverlappingFeatureSpiderfier.prototype.featureRemoved = function (evt) {
        var i, listenerRefs;
        if (evt.feature["_omsData"] != null) {
            this.unspiderfy();
        }
        i = this.arrIndexOf(this.markers, evt.feature);
        if (i < 0) {
            return this;
        }
        delete evt.feature["_oms"];
        this.markers.splice(i, 1);
        return this;
    };
    OverlappingFeatureSpiderfier.prototype.arrIndexOf = function (arr, obj) {
        var i, o, _i, _len;
        if (arr.indexOf != null) {
            return arr.indexOf(obj);
        }
        for (i = _i = 0, _len = arr.length; _i < _len; i = ++_i) {
            o = arr[i];
            if (o === obj) {
                return i;
            }
        }
        return -1;
    };
    OverlappingFeatureSpiderfier.prototype.llToPt = function (ll) {
        return this.projHelper.getProjection().fromLatLngToDivPixel(ll);
    };
    ;
    OverlappingFeatureSpiderfier.prototype.ptToLl = function (pt) {
        return this.projHelper.getProjection().fromDivPixelToLatLng(pt);
    };
    OverlappingFeatureSpiderfier.prototype.generatePtsCircle = function (count, centerPt) {
        var _this = this;
        var angle, angleStep, circumference, legLength;
        circumference = this.circleFootSeparation * (2 + count);
        legLength = circumference / this.twoPi;
        angleStep = this.twoPi / count;
        return this.range(0, count).map(function (i) {
            angle = _this.circleStartAngle + i * angleStep;
            return new google.maps.Point(centerPt.x + legLength * Math.cos(angle), centerPt.y + legLength * Math.sin(angle));
        });
    };
    OverlappingFeatureSpiderfier.prototype.generatePtsSpiral = function (count, centerPt) {
        var _this = this;
        var angle, legLength, pt;
        legLength = this.spiralLengthStart;
        angle = 0;
        return this.range(0, count).map(function (i) {
            angle += _this.spiralFootSeparation / legLength + i * 0.0005;
            pt = new google.maps.Point(centerPt.x + legLength * Math.cos(angle), centerPt.y + legLength * Math.sin(angle));
            legLength += _this.twoPi * _this.spiralLengthFactor / angle;
            return pt;
        });
    };
    OverlappingFeatureSpiderfier.prototype.range = function (start, end) {
        var result = [];
        for (var i = start; i < end; i++) {
            result.push(i);
        }
        return result;
    };
    return OverlappingFeatureSpiderfier;
})();
var ProjHelper = (function (_super) {
    __extends(ProjHelper, _super);
    function ProjHelper(map) {
        _super.call(this);
        this.map = map;
        this.setMap(map);
    }
    ProjHelper.prototype.draw = function () {
    };
    return ProjHelper;
})(google.maps.OverlayView);
//# sourceMappingURL=OverlappingFeatureSpiderfier.js.map