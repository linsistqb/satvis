// Import webpack externals
import Cesium from "Cesium";
import { SatelliteManager } from "./SatelliteManager";
import { DeviceDetect } from "./util/DeviceDetect";

export class CesiumController {
  constructor() {
    this.minimalUI = DeviceDetect.inIframe() || DeviceDetect.isIos();
    this.minimalUIAtStartup = DeviceDetect.inIframe();

    this.viewer = new Cesium.Viewer("cesiumContainer", {
      animation: !this.minimalUI,
      baseLayerPicker: false,
      fullscreenButton: !this.minimalUI,
      fullscreenElement: document.body,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      imageryProvider: this.createImageryProvider(),
      navigationHelpButton: false,
      navigationInstructionsInitiallyVisible: false,
      selectionIndicator: false,
      timeline: !this.minimalUI,
      vrButton: !this.minimalUI,
    });

    // Cesium default settings
    this.viewer.clock.shouldAnimate = true;
    this.viewer.scene.globe.enableLighting = true;
    this.viewer.scene.requestRenderMode = true;
    this.viewer.scene.maximumRenderTimeChange = 1/30;
    //this.viewer.scene.debugShowFramesPerSecond = true;

    // Export CesiumController for debugger
    window.cc = this;

    // CesiumController config
    this.imageryProviders = ["Offline", "OfflineHighres", "ArcGis", "OSM"];
    this.sceneModes = ["3D", "2D", "Columbus"];
    this.cameraModes = ["Fixed", "Inertial"];
    this.groundStationPicker = { enabled: false };

    this.createInputHandler();
    this.styleInfoBox();

    // Create Satellite Manager
    this.sats = new SatelliteManager(this.viewer);

    // Fix Cesium logo in minimal ui mode
    if (this.minimalUI) {
      setTimeout(() => { this.fixLogo(); }, 2000);
    }
  }

  set sceneMode(sceneMode) {
    switch(sceneMode) {
    case "3D":
      this.viewer.scene.morphTo3D();
      break;
    case "2D":
      this.viewer.scene.morphTo2D();
      break;
    case "Columbus":
      this.viewer.scene.morphToColumbusView();
      break;
    }
  }

  set imageryProvider(imageryProvider) {
    if (!this.imageryProviders.includes(imageryProvider)) {
      return;
    }

    const layers = this.viewer.scene.imageryLayers;
    layers.removeAll();
    layers.addImageryProvider(this.createImageryProvider(imageryProvider));
  }

  createImageryProvider(imageryProvider = "OfflineHighres") {
    let provider;
    switch(imageryProvider) {
    case "Offline":
      provider = new Cesium.createTileMapServiceImageryProvider({
        url: Cesium.buildModuleUrl("Assets/Textures/NaturalEarthII"),
      });
      break;
    case "OfflineHighres":
      provider = new Cesium.createTileMapServiceImageryProvider({
        url : "data/cesium-assets/imagery/NaturalEarthII",
        maximumLevel : 5,
        credit : "Imagery courtesy Natural Earth"
      });
      break;
    case "ArcGis":
      provider = new Cesium.ArcGisMapServerImageryProvider({
        url: "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer",
      });
      break;
    case "OSM":
      provider = new Cesium.createOpenStreetMapImageryProvider({
        url : "https://a.tile.openstreetmap.org/"
      });
      break;
    }
    return provider;
  }

  set cameraMode(cameraMode) {
    switch(cameraMode) {
    case "Inertial":
      this.viewer.scene.postUpdate.addEventListener(this.cameraTrackEci);
      break;
    case "Fixed":
      this.viewer.scene.postUpdate.removeEventListener(this.cameraTrackEci);
      break;
    }
  }

  cameraTrackEci(scene, time) {
    if (scene.mode !== Cesium.SceneMode.SCENE3D) {
      return;
    }

    const icrfToFixed = Cesium.Transforms.computeIcrfToFixedMatrix(time);
    if (Cesium.defined(icrfToFixed)) {
      const camera = scene.camera;
      const offset = Cesium.Cartesian3.clone(camera.position);
      const transform = Cesium.Matrix4.fromRotationTranslation(icrfToFixed);
      camera.lookAtTransform(transform, offset);
    }
  }

  createInputHandler() {
    const handler = new Cesium.ScreenSpaceEventHandler(this.viewer.scene.canvas);
    handler.setInputAction((event) => {
      if (!this.groundStationPicker.enabled) {
        return;
      }
      this.setGroundStationFromClickEvent(event);
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  }

  setGroundStationFromClickEvent(event) {
    const cartesian = this.viewer.camera.pickEllipsoid(event.position);
    const didHitGlobe = Cesium.defined(cartesian);
    if (didHitGlobe) {
      const coordinates = {};
      const cartographicPosition = Cesium.Cartographic.fromCartesian(cartesian);
      coordinates.longitude = Cesium.Math.toDegrees(cartographicPosition.longitude);
      coordinates.latitude = Cesium.Math.toDegrees(cartographicPosition.latitude);
      coordinates.height = Cesium.Math.toDegrees(cartographicPosition.height);
      coordinates.cartesian = cartesian;
      this.sats.setGroundStation(coordinates);
      this.groundStationPicker.enabled = false;
    }
  }

  setGroundStationFromGeolocation() {
    navigator.geolocation.getCurrentPosition(position => {
      if (typeof position === "undefined") {
        return;
      }
      const coordinates = {};
      coordinates.longitude = position.coords.longitude;
      coordinates.latitude = position.coords.latitude;
      coordinates.height = position.coords.altitude;
      coordinates.cartesian = Cesium.Cartesian3.fromDegrees(coordinates.longitude, coordinates.latitude, coordinates.height);
      this.sats.setGroundStation(coordinates);
    });
  }

  setGroundStationFromLatLon(latlon) {
    let [latitude, longitude, height] = latlon.split(",");
    if (!latitude || !longitude) {
      return;
    }
    const coordinates = {};
    coordinates.longitude = parseFloat(longitude);
    coordinates.latitude = parseFloat(latitude);
    coordinates.height = 0;
    if (height) {
      coordinates.height = parseFloat(height);
    }
    coordinates.cartesian = Cesium.Cartesian3.fromDegrees(coordinates.longitude, coordinates.latitude, coordinates.height);
    this.sats.setGroundStation(coordinates);
  }

  set showUI(enabled) {
    if (enabled) {
      this.viewer._animation.container.style.visibility = "";
      this.viewer._timeline.container.style.visibility = "";
      this.viewer._fullscreenButton._container.style.visibility = "";
      this.viewer._vrButton._container.style.visibility = "";
      this.viewer._bottomContainer.style.left = this.oldBottomContainerStyleLeft;
      this.viewer._bottomContainer.style.bottom = "30px";
    } else {
      this.viewer._animation.container.style.visibility = "hidden";
      this.viewer._timeline.container.style.visibility = "hidden";
      this.viewer._fullscreenButton._container.style.visibility = "hidden";
      this.viewer._vrButton._container.style.visibility = "hidden";
      this.oldBottomContainerStyleLeft = this.viewer._bottomContainer.style.left;
      this.viewer._bottomContainer.style.left = "5px";
      this.viewer._bottomContainer.style.bottom = "0px";
    }
  }

  get showUI() {
    return this.viewer._timeline.container.style.visibility !== "hidden";
  }

  fixLogo() {
    if (this.minimalUI) {
      this.viewer._bottomContainer.style.left = "5px";
    }
    if (DeviceDetect.isiPhoneWithNotch()) {
      this.viewer._bottomContainer.style.bottom = "20px";
    }
  }

  styleInfoBox() {
    const infoBox = this.viewer.infoBox.container.getElementsByClassName("cesium-infoBox")[0];
    const close = this.viewer.infoBox.container.getElementsByClassName("cesium-infoBox-close")[0];
    if (infoBox && close) {
      // Container for additional buttons
      let container = document.createElement("div");
      container.setAttribute("class", "cesium-infoBox-container");
      infoBox.insertBefore(container, close);

      // Notify button
      let notifyButton = document.createElement("button");
      notifyButton.setAttribute("type", "button");
      notifyButton.setAttribute("class", "cesium-button cesium-infoBox-custom");
      notifyButton.innerHTML = "<i class=\"fas fa-bell\" />";
      notifyButton.addEventListener("click", () => {
        if (this.sats.selectedSatellite) {
          this.sats.getSatellite(this.sats.selectedSatellite).props.notifyPasses();
        } else if (this.sats.groundStationAvailable && this.sats.groundStation.isSelected) {
          this.sats.enabledSatellites.forEach((sat) => {
            sat.props.notifyPasses();
          });
        }
      });
      container.appendChild(notifyButton);

      // Info button
      let infoButton = document.createElement("button");
      infoButton.setAttribute("type", "button");
      infoButton.setAttribute("class", "cesium-button cesium-infoBox-custom");
      infoButton.innerHTML = "<i class=\"fas fa-info\" />";
      infoButton.addEventListener("click", () => {
        if (!this.sats.selectedSatellite) {
          return;
        }
        const satnum = this.sats.getSatellite(this.sats.selectedSatellite).props.satnum;
        const url = "https://www.n2yo.com/satellite/?s=" + satnum;
        window.open(url, "_blank", "noopener");
      });
      container.appendChild(infoButton);
    }

    const frame = this.viewer.infoBox.frame;
    frame.addEventListener("load", function () {
      // Inline infobox css as iframe does not use service worker
      const head = frame.contentDocument.head;
      const links = head.getElementsByTagName("link");
      for (const link of links) {
        head.removeChild(link);
      }
      const css = require("to-string-loader!css-loader!postcss-loader!../css/infobox.ecss");
      const style = frame.contentDocument.createElement("style");
      var node = document.createTextNode(css);
      style.appendChild(node);
      head.appendChild(style);
    }, false);
  }
}
