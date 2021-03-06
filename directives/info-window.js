/**
 * @ngdoc directive
 * @name info-window
 * @param Attr2MapOptions {service}
 *   convert html attribute to Google map api options
 * @param $compile {service} $compile service
 * @description
 *  Defines infoWindow and provides compile method
 *
 *  Requires:  map directive
 *
 *  Restrict To:  Element
 *
 *  NOTE: this directive should **NOT** be used with `ng-repeat`
 *  because InfoWindow itself is a template, and a template must be
 *  reused by each marker, thus, should not be redefined repeatedly
 *  by `ng-repeat`.
 *
 * @attr {Boolean} visible
 *   Indicates to show it when map is initialized
 * @attr {Boolean} visible-on-marker
 *   Indicates to show it on a marker when map is initialized
 * @attr {Expression} geo-callback
 *   if position is an address, the expression is will be performed
 *   when geo-lookup is successful. e.g., geo-callback="showDetail()"
 * @attr {String} &lt;InfoWindowOption> Any InfoWindow options,
 *   https://developers.google.com/maps/documentation/javascript/reference?csw=1#InfoWindowOptions
 * @attr {String} &lt;InfoWindowEvent> Any InfoWindow events,
 *   https://developers.google.com/maps/documentation/javascript/reference
 * @example
 * Usage:
 *   <map MAP_ATTRIBUTES>
 *    <info-window id="foo" ANY_OPTIONS ANY_EVENTS"></info-window>
 *   </map>
 *
 * Example:
 *  <map center="41.850033,-87.6500523" zoom="3">
 *    <info-window id="1" position="41.850033,-87.6500523" >
 *      <div ng-non-bindable>
 *        Chicago, IL<br/>
 *        LatLng: {{chicago.lat()}}, {{chicago.lng()}}, <br/>
 *        World Coordinate: {{worldCoordinate.x}}, {{worldCoordinate.y}}, <br/>
 *        Pixel Coordinate: {{pixelCoordinate.x}}, {{pixelCoordinate.y}}, <br/>
 *        Tile Coordinate: {{tileCoordinate.x}}, {{tileCoordinate.y}} at Zoom Level {{map.getZoom()}}
 *      </div>
 *    </info-window>
 *  </map>
 */
/* global google */
(function() {
  'use strict';

  var infoWindow = function(Attr2MapOptions, $compile, $q, $templateRequest, $timeout, $parse, NgMap)  {
    var parser = Attr2MapOptions;

    var getInfoWindow = function(options, events, element) {
      var infoWindow;

      /**
       * set options
       */
      if (options.position && !(options.position instanceof google.maps.LatLng)) {
        delete options.position;
      }
      infoWindow = new google.maps.InfoWindow(options);

      /**
       * set events
       */
      for (var eventName in events) {
        if (eventName) {
          google.maps.event.addListener(infoWindow, eventName, events[eventName]);
        }
      }

      /**
       * set template and template-related functions
       * it must have a container element with ng-non-bindable
       */
      var templatePromise = $q(function(resolve) {
        if (angular.isString(element)) {
          $templateRequest(element).then(function (requestedTemplate) {
            resolve(angular.element(requestedTemplate).wrap('<div>').parent());
          }, function(message) {
            throw "info-window template request failed: " + message;
          });
        }
        else {
          resolve(element);
        }
      }).then(function(resolvedTemplate) {
        var template = resolvedTemplate.html().trim();
        if (angular.element(template).length != 1) {
          throw "info-window working as a template must have a container";
        }
        infoWindow.__template = template.replace(/\s?ng-non-bindable[='"]+/,"");
      });

      infoWindow.__open = function(map, scope, anchor) {
        templatePromise.then(function() {
          $timeout(function() {
            anchor && (scope.anchor = anchor);
            var el = $compile(infoWindow.__template)(scope);
            infoWindow.setContent(el[0]);
            scope.$apply();
            if (anchor && anchor.getPosition) {
              infoWindow.open(map, anchor);
            } else if (anchor && anchor instanceof google.maps.LatLng) {
              infoWindow.open(map);
              infoWindow.setPosition(anchor);
            } else {
              infoWindow.open(map);
            }
            $timeout(function() { // to avoid racing condition
              var infoWindowContainerEl = infoWindow.content.parentElement.parentElement.parentElement;
              // Fehler der Google API!  https://github.com/allenhwkim/angularjs-google-maps/issues/882
              //infoWindowContainerEl.className = "ng-map-info-window";
            });
          });
        });
      };

      return infoWindow;
    };

    var linkFunc = function(scope, element, attrs, mapController) {
      mapController = mapController[0]||mapController[1];

      element.css('display','none');

      var orgAttrs = parser.orgAttributes(element);
      var filtered = parser.filter(attrs);
      var options = parser.getOptions(filtered, {scope: scope});
      var events = parser.getEvents(scope, filtered);

      var infoWindow = getInfoWindow(options, events, options.template || element);
      var address;
      if (options.position && !(options.position instanceof google.maps.LatLng)) {
        address = options.position;
      }
      if (address) {
        NgMap.getGeoLocation(address).then(function(latlng) {
          infoWindow.setPosition(latlng);
          infoWindow.__open(mapController.map, scope, latlng);
          var geoCallback = attrs.geoCallback;
          geoCallback && $parse(geoCallback)(scope);
        });
      }

      mapController.addObject('infoWindows', infoWindow);
      mapController.observeAttrSetObj(orgAttrs, attrs, infoWindow);

      mapController.showInfoWindow =
      mapController.map.showInfoWindow = mapController.showInfoWindow ||
        function(p1, p2, p3) { //event, id, marker
          var id = typeof p1 == 'string' ? p1 : p2;
          var marker = typeof p1 == 'string' ? p2 : p3;
          if (typeof marker == 'string') {
            //Check if markers if defined to avoid odd 'undefined' errors
            if (
              typeof mapController.map.markers != "undefined"
              && typeof mapController.map.markers[marker] != "undefined") {
                marker = mapController.map.markers[marker];
            } else if (
              //additionally check if that marker is a custom marker
              typeof mapController.map.customMarkers !== "undefined"
              && typeof mapController.map.customMarkers[marker] !== "undefined") {
                marker = mapController.map.customMarkers[marker];
            } else {
              //Better error output if marker with that id is not defined
              throw new Error("Cant open info window for id " + marker + ". Marker or CustomMarker is not defined")
            }
          }

          var infoWindow = mapController.map.infoWindows[id];
          var anchor = marker ? marker : (this.getPosition ? this : null);
          infoWindow.__open(mapController.map, scope, anchor);
          if(mapController.singleInfoWindow) {
            if(mapController.lastInfoWindow) {
              scope.hideInfoWindow(mapController.lastInfoWindow);
            }
            mapController.lastInfoWindow = id;
          }
        };

      mapController.hideInfoWindow =
      mapController.map.hideInfoWindow = mapController.hideInfoWindow ||
        function(p1, p2) {
          var id = typeof p1 == 'string' ? p1 : p2;
          var infoWindow = mapController.map.infoWindows[id];
          infoWindow.close();
        };

      //TODO DEPRECATED
      scope.showInfoWindow = mapController.map.showInfoWindow;
      scope.hideInfoWindow = mapController.map.hideInfoWindow;

      var map = infoWindow.mapId ? {id:infoWindow.mapId} : 0;
      NgMap.getMap(map).then(function(map) {
        infoWindow.visible && infoWindow.__open(map, scope);
        if (infoWindow.visibleOnMarker) {
          var markerId = infoWindow.visibleOnMarker;
          infoWindow.__open(map, scope, map.markers[markerId]);
        }
      });

    }; //link

    return {
      restrict: 'E',
      require: ['?^map','?^ngMap'],
      link: linkFunc
    };

  }; // infoWindow
  infoWindow.$inject =
    ['Attr2MapOptions', '$compile', '$q', '$templateRequest', '$timeout', '$parse', 'NgMap'];

  angular.module('ngMap').directive('infoWindow', infoWindow);
})();
