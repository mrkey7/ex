(() => {
    let zoom = 1;
    const viewport = document.getElementById("canvasViewport");
    const canvas = document.getElementById("appCanvas");
    const header = document.querySelector(".topbar");
    const level = document.getElementById("zoomLevel");
    if (!viewport || !canvas || !header || !level) return;

    function update() {
        const desktop = window.matchMedia("(min-width: 901px)").matches;
        document.body.classList.toggle("canvas-desktop", desktop);
        if (!desktop) {
            canvas.style.removeProperty("--canvas-scale");
            canvas.style.removeProperty("left");
            canvas.style.removeProperty("top");
            canvas.style.removeProperty("height");
            return;
        }

        const headerHeight = header.offsetHeight;
        const availableHeight = Math.max(1, window.innerHeight - headerHeight);
        const availableWidth = Math.max(1, window.innerWidth);
        viewport.style.height = availableHeight + "px";
        canvas.style.height = availableHeight + "px";
        canvas.style.setProperty("--canvas-scale", zoom);
        canvas.style.left = "50%";
        canvas.style.top = "50%";
        level.textContent = Math.round(zoom * 100) + "%";
    }

    document.getElementById("zoomOutButton").addEventListener("click", () => {
        zoom = Math.max(0.5, Math.round((zoom - 0.1) * 10) / 10);
        update();
    });
    document.getElementById("zoomInButton").addEventListener("click", () => {
        zoom = Math.min(1.5, Math.round((zoom + 0.1) * 10) / 10);
        update();
    });
    document.getElementById("zoomRestoreButton").addEventListener("click", () => {
        zoom = 1;
        update();
    });
    window.addEventListener("resize", update);
    new MutationObserver(update).observe(document.body, {attributes:true,attributeFilter:["class"]});
    update();
})();
