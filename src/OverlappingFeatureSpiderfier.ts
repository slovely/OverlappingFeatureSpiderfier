class OverlappingFeatureSpiderfier {

    private markers: Array<IExtendedFeature> = [];
    private map: google.maps.Map;
    private projHelper: ProjHelper;
    private nearbyDistance = 20;
    private spiderfying: boolean;
    private spiderfied: boolean;
    private unspiderfying: boolean;
    private keepSpiderfied: boolean = false;
    private markersWontMove: boolean = false;
    private markersWontHide: boolean = false;
    private twoPi = Math.PI * 2;
    private circleSpiralSwitchover = 9;
    private circleFootSeparation = 23;
    private circleStartAngle = this.twoPi / 12;
    private spiralFootSeparation = 26;
    private spiralLengthStart = 11;
    private spiralLengthFactor = 4;
    private usualLegZIndex = 10;
    private legWeight = 1.5;

    public legColors: ILegColors = {
        usual: {},
        highlighted: {}
    };
    private lcH = this.legColors.highlighted;
    private lcU = this.legColors.usual;
    private listeners = [];

    constructor(layer: google.maps.Data, options?: IOverlappingFeatureSpiderfyOptions)
    constructor(layers: Array<google.maps.Data>, options?: IOverlappingFeatureSpiderfyOptions)
    constructor(layers: any, private options: IOverlappingFeatureSpiderfyOptions = null) {
        this.lcU[google.maps.MapTypeId.HYBRID] = this.lcU[google.maps.MapTypeId.SATELLITE] = "#fff";
        this.lcH[google.maps.MapTypeId.HYBRID] = this.lcH[google.maps.MapTypeId.SATELLITE] = "#f00";
        this.lcU[google.maps.MapTypeId.TERRAIN] = this.lcU[google.maps.MapTypeId.ROADMAP] = "#444";
        this.lcH[google.maps.MapTypeId.TERRAIN] = this.lcH[google.maps.MapTypeId.ROADMAP] = "#f00";

        if (!layers || layers.length === 0) {
            throw "You must pass in at least one layer";
        }

        if (!(layers instanceof Array)) {
            layers = [layers];
        }
        
        // Update the default options with those passed in
        for (let opt in options) {
            if (!options.hasOwnProperty(opt)) continue;
            this[opt] = options[opt];
        }

        // Setup event handlers for click/add/remove features
        this.addListenerToLayers(layers, "click", e => this.processClick(e));
        this.addListenerToLayers(layers, "addfeature", e => this.featureAdded(e));
        this.addListenerToLayers(layers, "removefeature", e => this.featureRemoved(e));
        // Listen to mouse out/over events so we can un/highlight spiderfied legs.
        this.addListenerToLayers(layers, "mouseout", e => this.featureMouseOut(e));
        this.addListenerToLayers(layers, "mouseover", e => this.featureMouseOver(e));
        // Setup event handlers for features moving or being hidden (if required)
        if (!this.markersWontHide) {
            this.addListenerToLayers(layers, "setgeometry", (e: google.maps.Data.SetGeometryEvent) => this.markerChangeListener(e.feature, false));
        }
        if (!this.markersWontMove) {
            this.addListenerToLayers(layers, "setproperty", (e: google.maps.Data.SetPropertyEvent) => {
                // Only interested in 'visible' property
                if (e.name === "visible") {
                    this.markerChangeListener(e.feature, false);
                }
            });
        }
        // Add any existing features on the layer
        layers.forEach(l => l.forEach(f => this.addFeature(f)));
        this.map = layers[0].getMap();

        // We need the layer to already have it's map set
        if (!this.map) throw "Layer map should be set before instantiating OverlappingFeatureSpiderfy!";
        this.projHelper = new ProjHelper(this.map);
        // unspiderfy when the map is clicked/changed
        ["click", "zoom_changed", "maptypeid_changed"].forEach((e) => google.maps.event.addListener(this.map, e, () => this.unspiderfy()));
    }

    public addListener(event, func) {
        var _base;
        ((_base = this.listeners)[event] != null ? (_base = this.listeners)[event] : _base[event] = []).push(func);
        return this;
    }

    public removeListener(event, func) {
        var i;
        i = this.arrIndexOf(this.listeners[event], func);
        if (!(i < 0)) {
            this.listeners[event].splice(i, 1);
        }
        return this;
    }

    public clearListeners(event) {
        this.listeners[event] = [];
        return this;
    }

    public markersNearMarker(marker: google.maps.Data.Feature, firstOnly: boolean = false) {
        if (this.projHelper.getProjection() == null) {
            throw "Must wait for 'idle' event on map before calling markersNearMarker";
        }
        let nDist = this.nearbyDistance;
        let pxSq = nDist * nDist;
        let geo = marker.getGeometry();
        if (geo.getType() !== "Point") return [];

        let markerPt = this.llToPt((<google.maps.Data.Point>geo).get());
        let markers = [];
        for (let i = 0, len = this.markers.length; i < len; i++) {
            let m = this.markers[i];
            geo = m.getGeometry();
            if (geo.getType() !== "Point") continue;
            let pos = (<google.maps.Data.Point>geo).get();

            if (m === marker || (m.getProperty("visible") === false)) {
                continue;
            }
            let mPt = this.llToPt(m._omsData != null ? (m._omsData.usualPosition || pos) : pos);
            if (this.ptDistanceSq(mPt, markerPt) < pxSq) {
                markers.push(m);
                if (firstOnly) {
                    break;
                }
            }
        }
        return markers;
    }

    public markersNearAnyOtherMarker() {
        if (this.projHelper.getProjection() == null) {
            throw "Must wait for 'idle' event on map before calling markersNearAnyOtherMarker";
        }
        let nDist = this.nearbyDistance;
        let pxSq = nDist * nDist;
        let mData = this.markers.map((m) => {
            let geo = m.getGeometry();
            let pos = (<google.maps.Data.Point>geo).get();

            return {
                pt: this.llToPt(m._omsData != null ? (m._omsData.usualPosition || pos) : pos),
                willSpiderfy: false
            };
        });

        for (let i = 0, len = this.markers.length; i < len; ++i) {
            let m1 = this.markers[i];
            if (m1.getProperty("visible") === false) {
                continue;
            }
            let m1Data = mData[i];
            if (m1Data.willSpiderfy) {
                continue;
            }

            for (let j = 0; j < len; ++j) {
                let m2 = this.markers[j];
                if (i === j) {
                    continue;
                }
                if (m2.getProperty("visible") === false) {
                    continue;
                }
                let m2Data = mData[j];
                if (j < i && !m2Data.willSpiderfy) {
                    continue;
                }
                if (this.ptDistanceSq(m1Data.pt, m2Data.pt) < pxSq) {
                    m1Data.willSpiderfy = m2Data.willSpiderfy = true;
                    break;
                }
            }
        }

        const results = [];
        for (let k = 0; k < this.markers.length; ++k) {
            let m = this.markers[k];
            if (mData[k].willSpiderfy) {
                results.push(m);
            }
        }
        return results;
    }

    private trigger(event, ...args) {
        var _ref1;
        return ((_ref1 = this.listeners[event]) != null ? _ref1 : []).map((func) => func.apply(null, args));
    }

    private markerChangeListener(marker: IExtendedFeature, positionChanged: boolean) {
        if (this.markers.indexOf(marker) === -1) return this;
        if ((marker._omsData != null) && (positionChanged || !marker.getProperty("visible")) && !(this.spiderfying != null || this.unspiderfying != null)) {
            return this.unspiderfy(positionChanged ? marker : null);
        }
    }

    private unspiderfy(markerNotToMove: IExtendedFeature = null) {
        if (this.spiderfied == null) {
            return this;
        }
        this.unspiderfying = true;
        let unspiderfiedMarkers = [];
        let nonNearbyMarkers = [];
        this.markers.forEach((marker) => {
            if (marker._omsData != null) {
                marker._omsData.leg.setMap(null);
                if (marker !== markerNotToMove) {
                    marker.setGeometry(new google.maps.Data.Point(marker._omsData.usualPosition));
                }
                delete marker["_omsData"];
                return unspiderfiedMarkers.push(marker);
            } else {
                return nonNearbyMarkers.push(marker);
            }
        });
        delete this.unspiderfying;
        delete this.spiderfied;
        this.trigger("unspiderfy", unspiderfiedMarkers, nonNearbyMarkers);
        return this;
    }

    private spiderfy(markerData, nonNearbyMarkers) {
        var bodyPt, footLl, footPts, leg, nearestMarkerDatum, numFeet, spiderfiedMarkers;
        this.spiderfying = true;
        numFeet = markerData.length;
        bodyPt = this.ptAverage(markerData.map((md) => md.markerPt));
        footPts = numFeet >= this["circleSpiralSwitchover"] ? this.generatePtsSpiral(numFeet, bodyPt).reverse() : this.generatePtsCircle(numFeet, bodyPt);
        spiderfiedMarkers = footPts.map((footPt) => {
            footLl = this.ptToLl(footPt);
            nearestMarkerDatum = this.minExtract(markerData, (md) => this.ptDistanceSq(md.markerPt, footPt));
            let marker = nearestMarkerDatum.marker as IExtendedFeature;
            leg = new google.maps.Polyline({
                map: this.map,
                path: [(<google.maps.Data.Point>marker.getGeometry()).get(), footLl],
                strokeColor: <string>this.legColors.usual[this.map.getMapTypeId()],
                strokeWeight: this.legWeight,
                zIndex: this.usualLegZIndex
            });
            marker._omsData = {
                usualPosition: (<google.maps.Data.Point>marker.getGeometry()).get(),
                leg: leg
            };

            marker.setGeometry(new google.maps.Data.Point(footLl));
            return marker;
        });
        delete this.spiderfying;
        this.spiderfied = true;
        return this.trigger("spiderfy", spiderfiedMarkers, nonNearbyMarkers);
    }
    
    private featureMouseOut(e: google.maps.Data.MouseEvent) {
        const feature = e.feature as IExtendedFeature;
        if (feature._omsData != null && feature._omsData.leg != null) {
            feature._omsData.leg.setOptions({
                strokeColor: <string>this.legColors.usual[this.map.getMapTypeId()],
                zIndex: this["usualLegZIndex"]
            });
        }
    }

    private featureMouseOver(e: google.maps.Data.MouseEvent) {
        const feature = e.feature as IExtendedFeature;
        if (feature._omsData != null && feature._omsData.leg != null) {
            feature._omsData.leg.setOptions({
                strokeColor: <string>this.legColors.highlighted[this.map.getMapTypeId()],
                zIndex: this["highlightedLegZIndex"]
            });
        }
    }

    private processClick(event: google.maps.Data.MouseEvent): void {
        if (!event.feature["_oms"]) return;

        var marker = event.feature;
        var geo = marker.getGeometry() as google.maps.Data.Point;

        // Only interested in 'Point' features
        if (geo.getType() !== "Point") return;

        var mPt, markerPt, markerSpiderfied, nDist, nearbyMarkerData, nonNearbyMarkers, pxSq, _i, _len;
        markerSpiderfied = marker["_omsData"] != null;
        if (!(markerSpiderfied && this.keepSpiderfied)) {
            this.unspiderfy();
        }
        if (markerSpiderfied || this.map.getStreetView().getVisible() || this.map.getMapTypeId() === "GoogleEarthAPI") {
            return this.trigger("click", event);
        } else {
            nearbyMarkerData = [];
            nonNearbyMarkers = [];
            nDist = this.nearbyDistance;
            pxSq = nDist * nDist;
            markerPt = this.llToPt(geo.get());
            for (_i = 0, _len = this.markers.length; _i < _len; _i++) {
                let m = this.markers[_i];
                let geo = m.getGeometry() as google.maps.Data.Point;
                if (geo.getType() !== "Point") continue;;

                if (!m.getProperty("visible")) {
                    continue;
                }
                mPt = this.llToPt(geo.get());
                if (this.ptDistanceSq(mPt, markerPt) < pxSq) {
                    nearbyMarkerData.push({
                        marker: m,
                        markerPt: mPt
                    });
                } else {
                    nonNearbyMarkers.push(m);
                }
            }
            if (nearbyMarkerData.length === 1) {
                return this.trigger("click", event);
            } else {
                return this.spiderfy(nearbyMarkerData, nonNearbyMarkers);
            }
        }
    }

    private ptDistanceSq = (pt1, pt2) => {
        var dx, dy;
        dx = pt1.x - pt2.x;
        dy = pt1.y - pt2.y;
        return dx * dx + dy * dy;
    }

    private featureAdded(evt: google.maps.Data.AddFeatureEvent) {
        this.addFeature(evt.feature);
    }

    private addFeature(feature: IExtendedFeature) {
        if (feature.getGeometry().getType() !== "Point") return;
        if (feature._oms) return;

        feature._oms = true;
        this.markers.push(feature);
    }

    private featureRemoved(evt: google.maps.Data.RemoveFeatureEvent) {
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
    }

    private arrIndexOf(arr, obj) {
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
    }


    private llToPt(ll: google.maps.LatLng) {
        return this.projHelper.getProjection().fromLatLngToDivPixel(ll);
    };

    private ptToLl(pt: google.maps.Point) {
        return this.projHelper.getProjection().fromDivPixelToLatLng(pt);
    }

    private ptAverage = (pts) => {
        var numPts, sumX, sumY;
        sumX = sumY = 0;
        pts.forEach((pt) => {
            sumX += pt.x;
            return sumY += pt.y;
        });
        numPts = pts.length;
        return new google.maps.Point(sumX / numPts, sumY / numPts);
    };

    private generatePtsCircle(count, centerPt) {
        var angle, angleStep, circumference, legLength;
        circumference = this.circleFootSeparation * (2 + count);
        legLength = circumference / this.twoPi;
        angleStep = this.twoPi / count;

        return this.range(0, count).map((i) => {
            angle = this.circleStartAngle + i * angleStep;
            return new google.maps.Point(centerPt.x + legLength * Math.cos(angle), centerPt.y + legLength * Math.sin(angle));
        });
    }

    private generatePtsSpiral(count, centerPt) {
        var angle, legLength, pt;
        legLength = this.spiralLengthStart;
        angle = 0;
        return this.range(0, count).map((i) => {
            angle += this.spiralFootSeparation / legLength + i * 0.0005;
            pt = new google.maps.Point(centerPt.x + legLength * Math.cos(angle), centerPt.y + legLength * Math.sin(angle));
            legLength += this.twoPi * this.spiralLengthFactor / angle;
            return pt;
        });
    }

    private range(start, end) {
        var result = [];
        for (var i = start; i < end; i++) {
            result.push(i);
        }
        return result;
    }

    private minExtract = (set, func) => {
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
    }

    private addListenerToLayers(layers: Array<google.maps.Data>, eventName: string, handler: (...args: any[]) => void): void {
        for (let i = 0; i < layers.length; i++) {
            layers[i].addListener(eventName, handler);
        }
    }
}


class ProjHelper extends google.maps.OverlayView {

    constructor(public map) {
        super();
        this.setMap(map);
    }

    public draw() {

    }
}

interface IOverlappingFeatureSpiderfyOptions {
    markersWontMove?: boolean;
    markersWontHide?: boolean;
    keepSpiderfied?: boolean;
    nearbyDistance?: number;
    circleSpiralSwitchover?: number;
    legWeight?: number;
}

interface ILegColors {
    usual: { [mapType: string]: string };
    highlighted: { [mapType: string]: string };
}

interface IOmsData {
    leg?: google.maps.Polyline;
    usualPosition?: google.maps.LatLng;
}

interface IExtendedFeature extends google.maps.Data.Feature {
    _omsData?: IOmsData;
    _oms?: boolean;
}