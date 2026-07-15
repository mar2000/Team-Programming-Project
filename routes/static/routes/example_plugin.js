/*
 * Przykład niewczytywanego domyślnie pluginu Route Editora.
 * Aby go przetestować, dodaj ten plik po tool_registry.js, a przed drawing_editor.js.
 */
window.RouteEditorPlugins.register({
    id: "example.canvas-inspector",
    name: "Inspektor canvasu",
    version: "1.0.0",
    tools: [{
        id: "plugin.canvas-inspector",
        label: "Sprawdź współrzędne",
        group: "examples",
        groupLabel: "Przykładowe dodatki",
        modes: ["graph", "geometry"],
        order: 900,
        help: "Kliknij canvas, aby odczytać współrzędne po uwzględnieniu siatki.",
        panelTemplate: "<p>To przykładowy panel ustawień dostarczony przez plugin.</p>",
        async onCanvasClick({point, setStatus}) {
            setStatus("Pozycja: x=" + point.x.toFixed(1) + ", y=" + point.y.toFixed(1));
            return {handled: true};
        },
    }],
});
