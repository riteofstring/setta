(() => {
  const tabs = Array.from(document.querySelectorAll("[role='tab']"));

  function selectTab(tab, moveFocus) {
    for (const candidate of tabs) {
      const selected = candidate === tab;
      candidate.setAttribute("aria-selected", String(selected));
      const panelId = candidate.getAttribute("aria-controls");
      const panel = panelId ? document.getElementById(panelId) : null;
      if (panel) {
        panel.hidden = !selected;
      }
    }

    if (moveFocus) {
      tab.focus();
    }
  }

  for (const tab of tabs) {
    tab.addEventListener("click", () => selectTab(tab, false));
    tab.addEventListener("keydown", (event) => {
      const index = tabs.indexOf(tab);
      let nextIndex = null;

      if (event.key === "ArrowRight") {
        nextIndex = (index + 1) % tabs.length;
      } else if (event.key === "ArrowLeft") {
        nextIndex = (index - 1 + tabs.length) % tabs.length;
      } else if (event.key === "Home") {
        nextIndex = 0;
      } else if (event.key === "End") {
        nextIndex = tabs.length - 1;
      }

      if (nextIndex !== null) {
        event.preventDefault();
        selectTab(tabs[nextIndex], true);
      }
    });
  }

  for (const savedViewTab of document.querySelectorAll("[data-setta-scene]")) {
    savedViewTab.addEventListener("click", () => {
      const scene = savedViewTab.getAttribute("data-setta-scene");
      const destination = scene
        ? document.getElementById(`tab-${scene}`)
        : null;
      if (destination) {
        selectTab(destination, false);
      }
    });
  }
})();
