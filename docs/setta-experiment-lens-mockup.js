(() => {
  const svgNamespace = "http://www.w3.org/2000/svg";
  const clamp = (value, minimum, maximum) =>
    Math.min(maximum, Math.max(minimum, value));
  const pathFrom = (points) =>
    points
      .map(
        (point, index) =>
          `${index === 0 ? "M" : "L"}${point[0].toFixed(1)} ${point[1].toFixed(1)}`,
      )
      .join(" ");

  const atlasStage = document.querySelector(".experiment-lens-atlas-stage");
  const cells = Array.from({ length: 24 }, (_, index) => ({
    id: `${index < 16 ? "NMC" : "LFP"}-${String(index + 1).padStart(2, "0")}`,
    chemistry: index < 16 ? "NMC" : "LFP",
    ambient: [-10, 0, 10, 25, 35, 45][index % 6],
    rate: [0.5, 1, 2][Math.floor(index / 2) % 3],
    phase: (index * 0.73) % Math.PI,
  }));
  const observations = cells.flatMap((cell, cellIndex) =>
    Array.from({ length: 36 }, (_, cycleIndex) => {
      const cycle = (cycleIndex + 1) * 25;
      const chemistryBase = cell.chemistry === "LFP" ? 0.998 : 0.993;
      const chemistryDecay = cell.chemistry === "LFP" ? 0.00014 : 0.00019;
      const temperaturePenalty = Math.max(0, cell.ambient - 25) * 0.00045;
      const coldPenalty = Math.max(0, 5 - cell.ambient) * 0.00012;
      const ratePenalty = (cell.rate - 0.5) * 0.000027;
      const variation =
        Math.sin(cycleIndex * 0.57 + cell.phase) * 0.0035 +
        ((cellIndex % 5) - 2) * 0.0012;
      const retention = clamp(
        chemistryBase -
          cycle * (chemistryDecay + temperaturePenalty / 95 + ratePenalty) -
          coldPenalty +
          variation,
        0.69,
        1.005,
      );
      const resistance =
        18 +
        cycle * (cell.chemistry === "LFP" ? 0.019 : 0.026) +
        cell.rate * 2.7 +
        Math.max(0, cell.ambient - 25) * 0.22 +
        (cellIndex % 4) * 0.8;
      const peak =
        27 +
        Math.max(0, cell.ambient) * 0.55 +
        cell.rate * 5.2 +
        cycle * 0.006 +
        (cellIndex % 3) * 0.9;
      const delta =
        5.5 + (1 - retention) * 115 + cell.rate * 2.4 + (cellIndex % 4);
      return {
        id: `${cell.id}-${String(cycle).padStart(3, "0")}`,
        cell: cell.id,
        chemistry: cell.chemistry,
        ambient: cell.ambient,
        rate: cell.rate,
        cycle,
        retention,
        resistance,
        peak,
        delta,
        phase: cell.phase,
      };
    }),
  );
  const atlasPointsGroup = atlasStage.querySelector("[data-atlas-points]");
  const atlasPointMap = new Map();
  observations.forEach((observation) => {
    const point = document.createElementNS(svgNamespace, "circle");
    const x = 52 + (observation.cycle / 900) * 552;
    const y = 14 + ((1.005 - observation.retention) / 0.315) * 204;
    point.setAttribute("cx", x.toFixed(1));
    point.setAttribute("cy", y.toFixed(1));
    point.setAttribute("r", observation.cycle % 100 === 0 ? "2.5" : "2.1");
    point.setAttribute("class", "experiment-lens-atlas-point");
    point.dataset.chemistry = observation.chemistry;
    point.setAttribute("role", "button");
    point.setAttribute(
      "aria-label",
      `${observation.cell}, cycle ${observation.cycle}, ${(observation.retention * 100).toFixed(1)} percent retention`,
    );
    point.addEventListener("click", () => selectObservation(observation));
    atlasPointsGroup.append(point);
    atlasPointMap.set(observation.id, point);
  });

  const atlasState = {
    chemistry: "all",
    maximumTemperature: 45,
    rates: new Set([0.5, 1, 2]),
    selected:
      observations.find(
        (observation) =>
          observation.cell === "NMC-12" && observation.cycle === 725,
      ) || observations[548],
    pinned: new Set(),
    time: 37,
  };
  [
    observations.find(
      (observation) =>
        observation.cell === "NMC-04" && observation.cycle === 700,
    ),
    observations.find(
      (observation) =>
        observation.cell === "NMC-12" && observation.cycle === 725,
    ),
    observations.find(
      (observation) =>
        observation.cell === "LFP-21" && observation.cycle === 800,
    ),
  ]
    .filter(Boolean)
    .forEach((observation) => atlasState.pinned.add(observation.id));

  const chemistrySelect = atlasStage.querySelector("[data-atlas-chemistry]");
  const temperatureInput = atlasStage.querySelector("[data-atlas-temperature]");
  const temperatureOutput = atlasStage.querySelector(
    "[data-atlas-temperature-output]",
  );
  const visibleOutput = atlasStage.querySelector("[data-atlas-visible]");
  const visibleHeader = atlasStage.querySelector("[data-atlas-visible-header]");
  const tableBody = atlasStage.querySelector("[data-atlas-table-body]");
  const tableCaption = atlasStage.querySelector("[data-atlas-table-caption]");
  const timeInput = atlasStage.querySelector("[data-atlas-time]");
  const compareWindow = atlasStage.querySelector("[data-atlas-compare-window]");
  const compareList = atlasStage.querySelector("[data-atlas-compare-list]");

  const visibleObservations = () =>
    observations.filter(
      (observation) =>
        (atlasState.chemistry === "all" ||
          observation.chemistry === atlasState.chemistry) &&
        observation.ambient <= atlasState.maximumTemperature &&
        atlasState.rates.has(observation.rate),
    );

  const normalizedCurve = (observation, kind) =>
    Array.from({ length: 31 }, (_, index) => {
      const t = index / 30;
      const age = 1 - observation.retention;
      if (kind === "voltage")
        return (
          0.82 -
          0.58 * Math.pow(t, 1.5) +
          age * 0.28 +
          Math.sin(t * 5 + observation.phase) * 0.018
        );
      if (kind === "temperature")
        return (
          0.86 -
          (0.22 + observation.rate * 0.08 + age * 0.42) *
            Math.sin(Math.PI * t) -
          age * 0.1 * t
        );
      return (
        0.44 +
        0.02 * Math.sin(t * 9 + observation.phase) +
        (t > 0.68 ? Math.pow((t - 0.68) / 0.32, 1.4) * 0.42 : 0)
      );
    });

  const curvePath = (observation, kind) =>
    pathFrom(
      normalizedCurve(observation, kind).map((value, index) => [
        36 + (index / 30) * 456,
        15 + value * 143,
      ]),
    );

  const thermalColor = (normalized) => {
    const hue = 244 - clamp(normalized, 0, 1) * 238;
    const lightness = 30 + clamp(normalized, 0, 1) * 26;
    return `hsl(${hue.toFixed(0)} 72% ${lightness.toFixed(0)}%)`;
  };

  const renderThermal = () => {
    const observation = atlasState.selected;
    const timeRatio = atlasState.time / 60;
    const grid = atlasStage.querySelector("[data-atlas-thermal-grid]");
    grid.replaceChildren();
    for (let row = 0; row < 8; row += 1) {
      for (let column = 0; column < 12; column += 1) {
        const distance = Math.hypot((column - 5.5) / 5.4, (row - 3.7) / 3.4);
        const hotspot = Math.max(0, 1 - distance) * (0.34 + timeRatio * 0.58);
        const ripple =
          (Math.sin(column * 1.3 + row * 0.9 + observation.phase) + 1) * 0.05;
        const normalized = clamp(
          0.12 +
            hotspot +
            ripple +
            observation.rate * 0.05 +
            (1 - observation.retention) * 0.34,
          0,
          1,
        );
        const rectangle = document.createElementNS(svgNamespace, "rect");
        rectangle.setAttribute("x", String(54 + column * 16));
        rectangle.setAttribute("y", String(25 + row * 16));
        rectangle.setAttribute("width", "16.5");
        rectangle.setAttribute("height", "16.5");
        rectangle.setAttribute("fill", thermalColor(normalized));
        grid.append(rectangle);
      }
    }
    const crosshairTemperature =
      25 +
      observation.ambient * 0.18 +
      observation.rate * 4.3 +
      timeRatio * 13.5 +
      (1 - observation.retention) * 18;
    atlasStage.querySelector("[data-atlas-crosshair]").textContent =
      `${crosshairTemperature.toFixed(1)} °C`;
    atlasStage.querySelector("[data-atlas-frame-context]").textContent =
      `${observation.cell} · frame ${String(atlasState.time * 12).padStart(3, "0")}`;
    atlasStage.querySelector("[data-atlas-frame-time]").textContent =
      `${String(atlasState.time).padStart(2, "0")}:00`;
    atlasStage.querySelector("[data-atlas-time-output]").textContent =
      `${atlasState.time} min`;
    const cursorX = 36 + (atlasState.time / 60) * 456;
    const cursor = atlasStage.querySelector("[data-atlas-time-cursor]");
    cursor.setAttribute("x1", cursorX.toFixed(1));
    cursor.setAttribute("x2", cursorX.toFixed(1));
  };

  const renderCycleDetail = () => {
    const observation = atlasState.selected;
    atlasStage.querySelector("[data-atlas-selected-id]").textContent =
      `${observation.cell} · cycle ${observation.cycle}`;
    atlasStage.querySelector("[data-atlas-retention]").textContent =
      `${(observation.retention * 100).toFixed(1)}%`;
    atlasStage.querySelector("[data-atlas-resistance]").textContent =
      `${observation.resistance.toFixed(1)} mΩ`;
    atlasStage.querySelector("[data-atlas-peak]").textContent =
      `${observation.peak.toFixed(1)} °C`;
    atlasStage.querySelector("[data-atlas-selected-rate]").textContent =
      `${observation.rate} C`;
    atlasStage
      .querySelector("[data-atlas-voltage]")
      .setAttribute("d", curvePath(observation, "voltage"));
    atlasStage
      .querySelector("[data-atlas-temperature-path]")
      .setAttribute("d", curvePath(observation, "temperature"));
    atlasStage
      .querySelector("[data-atlas-current]")
      .setAttribute("d", curvePath(observation, "current"));
    renderThermal();
  };

  const renderTable = (visible) => {
    const rows = [...visible]
      .sort((first, second) => first.retention - second.retention)
      .slice(0, 8);
    tableCaption.textContent = `lowest retention · ${rows.length} of ${visible.length}`;
    tableBody.innerHTML = rows
      .map(
        (observation) => `
            <tr data-atlas-row="${observation.id}" data-selected="${observation.id === atlasState.selected.id}">
              <td><button class="experiment-lens-table-button" type="button" data-atlas-pin="${observation.id}" aria-label="${atlasState.pinned.has(observation.id) ? "Unpin" : "Pin"} ${observation.cell} cycle ${observation.cycle}" aria-pressed="${atlasState.pinned.has(observation.id)}">${atlasState.pinned.has(observation.id) ? "◆" : "◇"}</button></td>
              <td>${observation.cell} / ${observation.cycle}</td>
              <td>${observation.chemistry}</td>
              <td>${observation.ambient}</td>
              <td>${observation.rate} C</td>
              <td>${(observation.retention * 100).toFixed(1)}%</td>
              <td>${observation.resistance.toFixed(1)} mΩ</td>
              <td>${observation.peak.toFixed(1)}</td>
              <td>${observation.delta.toFixed(1)}</td>
            </tr>`,
      )
      .join("");
    tableBody.querySelectorAll("[data-atlas-row]").forEach((row) => {
      row.addEventListener("click", () =>
        selectObservation(
          observations.find(
            (observation) => observation.id === row.dataset.atlasRow,
          ),
        ),
      );
    });
    tableBody.querySelectorAll("[data-atlas-pin]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        if (atlasState.pinned.has(button.dataset.atlasPin))
          atlasState.pinned.delete(button.dataset.atlasPin);
        else {
          if (atlasState.pinned.size >= 3)
            atlasState.pinned.delete(atlasState.pinned.values().next().value);
          atlasState.pinned.add(button.dataset.atlasPin);
        }
        renderAtlas();
        renderComparison();
      });
    });
  };

  const renderComparison = () => {
    const pinned = [...atlasState.pinned]
      .map((id) => observations.find((observation) => observation.id === id))
      .filter(Boolean);
    atlasStage.querySelector("[data-atlas-open-compare]").textContent =
      `Compare ${pinned.length} pinned`;
    compareList.innerHTML = pinned.length
      ? pinned
          .map((observation) => {
            const points = normalizedCurve(observation, "temperature")
              .map((value, index) => `${(index / 30) * 330},${value * 48 + 3}`)
              .join(" ");
            return `<div class="experiment-lens-compare-row">
              <div><strong>${observation.cell} / ${observation.cycle}</strong><small>${observation.chemistry} · ${observation.ambient} °C · ${observation.rate} C</small></div>
              <svg viewBox="0 0 330 54" role="img" aria-label="Temperature trace for ${observation.cell} cycle ${observation.cycle}"><line x1="0" x2="330" y1="50" y2="50" stroke="rgb(43 54 74)"></line><polyline points="${points}" fill="none" stroke="rgb(248 181 81)" stroke-width="2"></polyline></svg>
              <span class="experiment-lens-compare-value">${(observation.retention * 100).toFixed(1)}%</span>
              <span class="experiment-lens-compare-value">${observation.peak.toFixed(1)} °C</span>
              <button class="experiment-lens-table-button" type="button" data-atlas-unpin="${observation.id}" aria-label="Unpin ${observation.cell} cycle ${observation.cycle}">×</button>
            </div>`;
          })
          .join("")
      : `<div style="padding: 24px; color: rgb(117 136 174)">Pin up to three rows from the spreadsheet.</div>`;
    compareList.querySelectorAll("[data-atlas-unpin]").forEach((button) =>
      button.addEventListener("click", () => {
        atlasState.pinned.delete(button.dataset.atlasUnpin);
        renderAtlas();
        renderComparison();
      }),
    );
  };

  function selectObservation(observation) {
    if (!observation) return;
    atlasState.selected = observation;
    atlasPointMap.forEach(
      (point, id) => (point.dataset.selected = String(id === observation.id)),
    );
    tableBody
      .querySelectorAll("[data-atlas-row]")
      .forEach(
        (row) =>
          (row.dataset.selected = String(
            row.dataset.atlasRow === observation.id,
          )),
      );
    renderCycleDetail();
  }

  const renderAtlas = () => {
    const visible = visibleObservations();
    const visibleIds = new Set(visible.map((observation) => observation.id));
    atlasPointMap.forEach(
      (point, id) => (point.dataset.filtered = String(!visibleIds.has(id))),
    );
    if (!visibleIds.has(atlasState.selected.id) && visible.length)
      atlasState.selected = visible[0];
    visibleOutput.textContent = `${visible.length} cycles`;
    visibleHeader.textContent = `${visible.length} / ${observations.length}`;
    temperatureOutput.textContent = `${atlasState.maximumTemperature} °C`;
    atlasStage
      .querySelectorAll("[data-atlas-rate]")
      .forEach((button) =>
        button.setAttribute(
          "aria-pressed",
          String(atlasState.rates.has(Number(button.dataset.atlasRate))),
        ),
      );
    renderTable(visible);
    selectObservation(atlasState.selected);
    renderComparison();
  };

  chemistrySelect.addEventListener("change", () => {
    atlasState.chemistry = chemistrySelect.value;
    renderAtlas();
  });
  temperatureInput.addEventListener("input", () => {
    atlasState.maximumTemperature = Number(temperatureInput.value);
    renderAtlas();
  });
  atlasStage.querySelectorAll("[data-atlas-rate]").forEach((button) =>
    button.addEventListener("click", () => {
      const rate = Number(button.dataset.atlasRate);
      if (atlasState.rates.has(rate) && atlasState.rates.size === 1) return;
      if (atlasState.rates.has(rate)) atlasState.rates.delete(rate);
      else atlasState.rates.add(rate);
      renderAtlas();
    }),
  );
  timeInput.addEventListener("input", () => {
    atlasState.time = Number(timeInput.value);
    renderThermal();
  });
  atlasStage
    .querySelector("[data-atlas-open-compare]")
    .addEventListener("click", () => {
      compareWindow.hidden = false;
    });
  atlasStage
    .querySelector("[data-atlas-close-compare]")
    .addEventListener("click", () => {
      compareWindow.hidden = true;
    });
  renderAtlas();

  const replayStage = document.querySelector(".experiment-lens-replay-stage");
  const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const directionDegrees = {
    N: -90,
    NE: -45,
    E: 0,
    SE: 45,
    S: 90,
    SW: 135,
    W: 180,
    NW: -135,
  };
  const speeds = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20];
  const matrixData = directions.flatMap((direction, directionIndex) =>
    speeds.map((speed, speedIndex) => {
      const directionalRisk = [0.06, 0.1, 0.15, 0.22, 0.18, 0.3, 0.38, 0.46][
        directionIndex
      ];
      const speedRisk = Math.pow(speed / 20, 1.72) * 0.58;
      const interaction =
        Math.sin(directionIndex * 1.7 + speedIndex * 0.82) * 0.055;
      const rate = clamp(
        directionalRisk + speedRisk + interaction - 0.08,
        0.02,
        0.96,
      );
      return {
        direction,
        directionIndex,
        speed,
        speedIndex,
        rate,
        failures: Math.round(rate * 30),
      };
    }),
  );
  const replayState = {
    scenario: matrixData.find(
      (cell) => cell.direction === "NW" && cell.speed === 14,
    ),
    time: 62,
    playing: false,
    timer: null,
  };
  const replayMatrix = replayStage.querySelector("[data-replay-matrix]");
  matrixData.forEach((cell) => {
    const button = document.createElement("button");
    button.className = "experiment-lens-matrix-cell";
    button.type = "button";
    button.dataset.replayCell = `${cell.direction}-${cell.speed}`;
    button.setAttribute(
      "aria-label",
      `${cell.direction} wind, ${cell.speed} meters per second, ${Math.round(cell.rate * 100)} percent failure rate`,
    );
    button.textContent = `${Math.round(cell.rate * 100)}%`;
    const alpha = 0.12 + cell.rate * 0.72;
    const color =
      cell.rate < 0.34
        ? `rgb(30 58 138 / ${alpha.toFixed(2)})`
        : cell.rate < 0.62
          ? `rgb(180 116 43 / ${alpha.toFixed(2)})`
          : `rgb(185 57 72 / ${alpha.toFixed(2)})`;
    button.style.background = color;
    button.addEventListener("click", () => {
      replayState.scenario = cell;
      replayState.time = 0;
      replayStage.querySelector("[data-replay-time]").value = "0";
      renderReplay();
    });
    replayMatrix.append(button);
  });

  const eventTemplates = [
    [0, "Simulation initialized", "seed 17 · controller armed", "normal"],
    [8, "Approach corridor entered", "cross-track error 0.08 m", "normal"],
    [17, "First gust applied", "wind field sample 1,284", "normal"],
    [29, "Yaw correction", "command +11.4°", "normal"],
    [41, "Left motor above 90%", "saturation window begins", "warning"],
    [52, "Obstacle margin narrowing", "clearance 0.61 m", "warning"],
    [61, "Tracking error rising", "error derivative +0.42 m/s", "warning"],
    [68, "Position loop saturated", "integrator clamped", "critical"],
    [75, "Dock corridor exited", "lateral offset 0.83 m", "critical"],
    [83, "Recovery command", "fallback gains applied", "warning"],
    [92, "Minimum clearance", "0.18 m at bay column", "critical"],
    [100, "Run terminated", "unsafe trajectory retained", "critical"],
  ];

  const replayEvents = replayStage.querySelector("[data-replay-events]");
  replayEvents.innerHTML = eventTemplates
    .map(
      ([time, title, detail, severity]) => `
          <button class="experiment-lens-event-button" type="button" data-replay-event-time="${time}" data-severity="${severity}">
            <time>${(time * 0.24).toFixed(1)} s</time><span class="experiment-lens-event-marker"></span><span class="experiment-lens-event-copy"><strong>${title}</strong><span>${detail}</span></span>
          </button>`,
    )
    .join("");
  replayEvents.querySelectorAll("[data-replay-event-time]").forEach((button) =>
    button.addEventListener("click", () => {
      replayState.time = Number(button.dataset.replayEventTime);
      replayStage.querySelector("[data-replay-time]").value = String(
        replayState.time,
      );
      renderReplayFrame();
    }),
  );

  const trajectoryPoints = (scenario, offset = 0) =>
    Array.from({ length: 101 }, (_, index) => {
      const t = index / 100;
      const directionSign = [0.1, 0.35, 0.65, 0.9, 0.5, -0.5, -0.85, -1][
        scenario.directionIndex
      ];
      const gust = (scenario.speed / 20) * directionSign;
      const failurePulse = Math.exp(-Math.pow((t - 0.68) / 0.19, 2));
      const x =
        55 +
        t * 393 +
        Math.sin(t * Math.PI * 3 + offset) * (3 + scenario.speed * 0.18);
      const y =
        238 -
        t * 192 +
        Math.sin(t * Math.PI * 2.2 + offset * 0.8) * 12 +
        gust * failurePulse * 76 +
        offset * 2.5;
      return [clamp(x, 18, 482), clamp(y, 18, 260)];
    });

  const renderReplaySignals = () => {
    const scenario = replayState.scenario;
    const risk = scenario.rate;
    const samples = Array.from({ length: 81 }, (_, index) => {
      const t = index / 80;
      const pulse = Math.exp(-Math.pow((t - 0.7) / 0.16, 2));
      return {
        error: clamp(
          0.16 + Math.sin(t * 16) * 0.035 + pulse * (0.34 + risk * 0.54),
          0.04,
          0.98,
        ),
        motor: clamp(
          0.31 + Math.sin(t * 10 + 0.8) * 0.05 + pulse * (0.31 + risk * 0.48),
          0.05,
          0.98,
        ),
        altitude: clamp(
          0.79 - t * 0.15 - pulse * (0.18 + risk * 0.36),
          0.05,
          0.95,
        ),
      };
    });
    const signalPath = (key) =>
      pathFrom(
        samples.map((sample, index) => [
          42 + (index / 80) * 444,
          18 + sample[key] * 160,
        ]),
      );
    replayStage
      .querySelector("[data-replay-signal-error]")
      .setAttribute("d", signalPath("error"));
    replayStage
      .querySelector("[data-replay-signal-motor]")
      .setAttribute("d", signalPath("motor"));
    replayStage
      .querySelector("[data-replay-signal-altitude]")
      .setAttribute("d", signalPath("altitude"));
  };

  const renderReplayFrame = () => {
    const scenario = replayState.scenario;
    const points = trajectoryPoints(scenario);
    const index = replayState.time;
    const current = points[index];
    replayStage.querySelector("[data-replay-trail]").setAttribute(
      "points",
      points
        .slice(0, index + 1)
        .map((point) => point.join(","))
        .join(" "),
    );
    replayStage
      .querySelector("[data-replay-drone]")
      .setAttribute(
        "transform",
        `translate(${current[0].toFixed(1)} ${current[1].toFixed(1)})`,
      );
    replayStage.querySelector("[data-replay-timestamp]").textContent =
      `${(index * 0.24).toFixed(1)} s / 24.0 s`;
    const pulse = Math.exp(-Math.pow((index / 100 - 0.7) / 0.16, 2));
    const error =
      0.08 +
      pulse * (0.42 + scenario.rate * 0.58) +
      Math.abs(Math.sin(index * 0.14)) * 0.04;
    replayStage.querySelector("[data-replay-error]").textContent =
      `${error.toFixed(2)} m`;
    const cursorX = 42 + (index / 100) * 444;
    const cursor = replayStage.querySelector("[data-replay-signal-cursor]");
    cursor.setAttribute("x1", cursorX.toFixed(1));
    cursor.setAttribute("x2", cursorX.toFixed(1));
    let activeEvent = 0;
    eventTemplates.forEach((event, eventIndex) => {
      if (event[0] <= index) activeEvent = eventIndex;
    });
    replayEvents
      .querySelectorAll("[data-replay-event-time]")
      .forEach(
        (button, eventIndex) =>
          (button.dataset.active = String(eventIndex === activeEvent)),
      );
  };

  const renderReplayConfig = () => {
    const scenario = replayState.scenario;
    replayStage.querySelector("[data-replay-config]").innerHTML =
      `<span>{</span>\n  <span class="experiment-lens-code-key">"controller"</span>: <span class="experiment-lens-code-string">"dock-lqr-v12"</span>,\n  <span class="experiment-lens-code-key">"seed"</span>: <span class="experiment-lens-code-number">17</span>,\n  <span class="experiment-lens-code-key">"wind"</span>: {\n    <span class="experiment-lens-code-key">"direction"</span>: <span class="experiment-lens-code-string">"${scenario.direction}"</span>,\n    <span class="experiment-lens-code-key">"gust_m_s"</span>: <span class="experiment-lens-code-number">${scenario.speed}</span>,\n    <span class="experiment-lens-code-key">"turbulence"</span>: <span class="experiment-lens-code-number">0.42</span>\n  },\n  <span class="experiment-lens-code-key">"gains"</span>: {\n    <span class="experiment-lens-code-key">"position"</span>: <span class="experiment-lens-code-number">1.84</span>,\n    <span class="experiment-lens-code-key">"velocity"</span>: <span class="experiment-lens-code-number">0.63</span>,\n    <span class="experiment-lens-code-key">"yaw"</span>: <span class="experiment-lens-code-number">0.91</span>\n  },\n  <span class="experiment-lens-code-key">"result"</span>: <span class="experiment-lens-code-string">"unsafe"</span>\n<span>}</span>`;
  };

  const renderReplay = () => {
    const scenario = replayState.scenario;
    replayMatrix
      .querySelectorAll("[data-replay-cell]")
      .forEach((button) =>
        button.setAttribute(
          "aria-pressed",
          String(
            button.dataset.replayCell ===
              `${scenario.direction}-${scenario.speed}`,
          ),
        ),
      );
    replayStage.querySelector("[data-replay-scenario]").textContent =
      `${scenario.direction} wind · ${scenario.speed} m/s`;
    replayStage.querySelector("[data-replay-scenario-detail]").textContent =
      `${scenario.failures} of 30 trajectories unstable`;
    replayStage.querySelector("[data-replay-failure-rate]").textContent =
      `${Math.round(scenario.rate * 100)}% failure`;
    replayStage.querySelector("[data-replay-wind-label]").textContent =
      `${scenario.direction} ${scenario.speed} m/s`;
    replayStage
      .querySelector("[data-replay-wind]")
      .setAttribute(
        "transform",
        `translate(57 41) rotate(${directionDegrees[scenario.direction]})`,
      );
    const neighbors = replayStage.querySelector("[data-replay-neighbor-paths]");
    neighbors.replaceChildren();
    [-2.6, -1.8, -1.1, -0.55, 0.55, 1.1, 1.8, 2.6].forEach((offset) => {
      const path = document.createElementNS(svgNamespace, "polyline");
      path.setAttribute("class", "experiment-lens-neighbor-path");
      path.setAttribute(
        "points",
        trajectoryPoints(scenario, offset)
          .map((point) => point.join(","))
          .join(" "),
      );
      neighbors.append(path);
    });
    const selectedPoints = trajectoryPoints(scenario);
    replayStage
      .querySelector("[data-replay-selected-path]")
      .setAttribute(
        "points",
        selectedPoints.map((point) => point.join(",")).join(" "),
      );
    renderReplaySignals();
    renderReplayConfig();
    renderReplayFrame();
  };

  const replayTimeInput = replayStage.querySelector("[data-replay-time]");
  replayTimeInput.addEventListener("input", () => {
    replayState.time = Number(replayTimeInput.value);
    renderReplayFrame();
  });
  replayStage
    .querySelector("[data-replay-signals-hit]")
    .addEventListener("click", (event) => {
      const bounds = event.currentTarget.getBoundingClientRect();
      replayState.time = Math.round(
        clamp((event.clientX - bounds.left) / bounds.width, 0, 1) * 100,
      );
      replayTimeInput.value = String(replayState.time);
      renderReplayFrame();
    });
  const playButton = replayStage.querySelector("[data-replay-play]");
  const stopPlayback = () => {
    if (replayState.timer) window.clearInterval(replayState.timer);
    replayState.timer = null;
    replayState.playing = false;
    playButton.setAttribute("aria-pressed", "false");
    playButton.innerHTML = `<svg class="setta-icon"><use href="#icon-play"></use></svg><span>Play</span>`;
  };
  playButton.addEventListener("click", () => {
    if (replayState.playing) {
      stopPlayback();
      return;
    }
    if (replayState.time >= 100) replayState.time = 0;
    replayState.playing = true;
    playButton.setAttribute("aria-pressed", "true");
    playButton.innerHTML = `<svg class="setta-icon"><use href="#icon-pause"></use></svg><span>Pause</span>`;
    replayState.timer = window.setInterval(() => {
      replayState.time += 1;
      replayTimeInput.value = String(replayState.time);
      renderReplayFrame();
      if (replayState.time >= 100) stopPlayback();
    }, 90);
  });
  renderReplay();
})();
