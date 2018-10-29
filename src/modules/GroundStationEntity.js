import { CesiumEntityWrapper } from "./CesiumEntityWrapper";
import { DescriptionHelper } from "./DescriptionHelper";

import Cesium from "Cesium";
import dayjs from "dayjs";

export class GroundStationEntity extends CesiumEntityWrapper {
  constructor(viewer, sats, position) {
    super(viewer);
    this.sats = sats;

    this.name = "Ground station";
    this.position = position;

    this.createEntities();
  }

  createEntities() {
    this.createDescription();
    this.createGroundStation();

    this.viewer.selectedEntityChanged.addEventListener(() => {
      if (this.isSelected && !this.isTracked) {
        this.setSelectedOnTickCallback((clock) => {
          for (let sat of Object.values(this.sats.satellites)) {
            sat.props.updatePasses(clock.currentTime);
          }
        });
      }
    });
    this.viewer.trackedEntityChanged.addEventListener(() => {
      if (this.isTracked) {
        this.setTrackedOnTickCallback((clock) => {
          for (let sat of Object.values(this.sats.satellites)) {
            sat.props.updatePasses(clock.currentTime);
          }
        });
      }
    });
  }

  createGroundStation() {
    const billboard = new Cesium.BillboardGraphics({
      image: require("../assets/images/icons/dish.svg"),
      horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      width: 24,
      height: 24,
    });
    this.createCesiumEntity("Groundstation", "billboard", billboard, this.name, this.description, this.position.cartesian, false);
    this.defaultEntity = this.entities["Groundstation"];
  }

  createDescription() {
    const description = new Cesium.CallbackProperty((time) => {
      const passes = this.passes(time);
      const content = DescriptionHelper.renderDescription(time, this.name, this.position, passes, true);
      return content;
    });
    this.description = description;
  }

  passes(time, deltaHours = 48) {
    let passes = [];
    // Aggregate passes from all satellites
    for (let sat of Object.values(this.sats.satellites)) {
      passes.push(...sat.props.passes);
    }

    // Filter passes based on time
    passes = passes.filter((pass) => {
      return dayjs(pass.start).diff(time, "hours") < deltaHours;
    });

    // Sort passes by time
    passes = passes.sort((a, b) => {
      return a.start - b.start;
    });
    return passes;
  }
}
