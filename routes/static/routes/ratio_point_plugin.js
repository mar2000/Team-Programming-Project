(function () {
    "use strict";

    const TOOL_ID = "plugin.geometry.ratio-point";

    window.RouteEditorGeometryCommands.register({
        id: "ratio_point",
        label: "Punkt w proporcji",
        resultType: "geometry.ratio_point",
        inputFields: ["source", "target"],
        inputType: "geometry.point",
        parameterFields: ["ratio"],
        help: "Wybierz dwa punkty i parametr t; P=(1-t)A+tB.",
    });

    function ratioInput(editor) {
        return editor.root.querySelector("[data-role='ratio-value']");
    }

    window.RouteEditorPlugins.register({
        id: "geometry.ratio-point",
        name: "Punkt w proporcji",
        version: "2.1.0",
        objectTypes: [{
            id: "geometry.ratio_point",
            displayName: "Punkt w proporcji",
            modes: ["geometry", "mixed"],
            dependencyFields: ["source", "target"],
            pointLike: true,
            positioned: true,
            objectActions: [
                {
                    id: "set-midpoint",
                    label: "Ustaw t = 0.5",
                    title: "Ustaw jeden lub wiele punktów dokładnie w połowie odcinka.",
                    supportsMultiple: true,
                    isEnabled({objects, object}) {
                        const targets = Array.isArray(objects) && objects.length ? objects : [object];
                        return targets.some((item) => Number(item.data && item.data.ratio) !== 0.5);
                    },
                    buildPatch({object}) {
                        return {data: {...(object.data || {}), ratio: 0.5}};
                    },
                    successMessage: "Ustawiono punkt w połowie odcinka (t = 0.5).",
                },
                {
                    id: "create-mirrored-points",
                    label: "Utwórz punkty symetryczne",
                    title: "Utwórz dla każdego zaznaczonego punktu nowy punkt o parametrze 1−t na tym samym odcinku.",
                    supportsMultiple: true,
                    createsObjects: true,
                    async runSelection({objects, editor, createObjects}) {
                        const payloads = [];
                        objects.forEach((object, index) => {
                            const data = object.data || {};
                            const ratio = Number(data.ratio);
                            const mirroredRatio = Number.isFinite(ratio) ? 1 - ratio : 0.5;
                            const pointClientId = "mirrored-point-" + index;
                            const labelText = data.label ? data.label + "′" : "P′";
                            // Celowo dodajemy etykietę przed punktem. Krok 58 ustala
                            // poprawną kolejność tworzenia z grafu zależności $created:.
                            payloads.push({
                                type: "label.relative",
                                data: {
                                    baseObjectId: "$created:" + pointClientId,
                                    text: labelText,
                                    dx: 14,
                                    dy: -14,
                                },
                                style: editor.styleForNewObject("label.relative"),
                                order: Number.isFinite(Number(object.order)) ? Number(object.order) + 2 : 0,
                            });
                            payloads.push({
                                clientId: pointClientId,
                                type: "geometry.ratio_point",
                                data: {
                                    ...data,
                                    ratio: mirroredRatio,
                                    label: "",
                                },
                                style: editor.cloneObject(object.style || editor.styleForNewObject("geometry.ratio_point")),
                                order: Number.isFinite(Number(object.order)) ? Number(object.order) + 1 : 0,
                            });
                        });
                        await createObjects(payloads, {
                            selectCreated: true,
                            successMessage: () => "Utworzono " + objects.length + " punkt" + (objects.length === 1 ? " symetryczny z etykietą." : "ów symetrycznych z etykietami."),
                        });
                        return true;
                    },
                },
                {
                    id: "swap-endpoints",
                    label: "Zamień końce A ↔ B",
                    title: "Zamień punkty bazowe dla jednego lub wielu punktów, zachowując ich położenie.",
                    supportsMultiple: true,
                    buildPatch({object}) {
                        const data = object.data || {};
                        const ratio = Number(data.ratio);
                        return {
                            data: {
                                ...data,
                                source: data.target,
                                target: data.source,
                                ratio: Number.isFinite(ratio) ? 1 - ratio : ratio,
                            },
                        };
                    },
                    successMessage: "Zamieniono punkty bazowe i zachowano położenie punktu.",
                },
            ],
            propertyFields: [
                {
                    key: "ratio",
                    label: "Parametr t",
                    type: "number",
                    path: "data.ratio",
                    min: 0,
                    max: 1,
                    step: 0.05,
                    help: "P = (1−t)A + tB. Wartość musi należeć do przedziału [0, 1].",
                    validate(value) {
                        return Number.isFinite(value) && value >= 0 && value <= 1
                            ? null
                            : "Parametr t musi być liczbą od 0 do 1.";
                    },
                },
                {
                    key: "label",
                    label: "Etykieta punktu",
                    type: "text",
                    path: "data.label",
                    placeholder: "np. P",
                },
            ],
            resolvePosition({object, findObject, resolvePosition}) {
                const source = findObject(object.data && object.data.source);
                const target = findObject(object.data && object.data.target);
                const sourcePosition = resolvePosition(source);
                const targetPosition = resolvePosition(target);
                const ratio = Number(object.data && object.data.ratio);
                if (!sourcePosition || !targetPosition || !Number.isFinite(ratio)) { return null; }
                return {
                    x: sourcePosition.x + ratio * (targetPosition.x - sourcePosition.x),
                    y: sourcePosition.y + ratio * (targetPosition.y - sourcePosition.y),
                };
            },
            render({object, svg, document, resolvePosition, isSelected, bindPointerDown}) {
                const position = resolvePosition(object);
                if (!position) { return true; }
                const size = Number(object.style && object.style.radius) || 7;
                const diamond = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
                diamond.setAttribute("points", [
                    position.x + "," + (position.y - size),
                    (position.x + size) + "," + position.y,
                    position.x + "," + (position.y + size),
                    (position.x - size) + "," + position.y,
                ].join(" "));
                diamond.setAttribute("fill", object.style && object.style.fill || "#f59e0b");
                diamond.setAttribute("stroke", object.style && object.style.stroke || "#92400e");
                diamond.setAttribute("stroke-width", isSelected(object.object_id) ? "3" : String(object.style && object.style.strokeWidth || 1.5));
                diamond.setAttribute("class", "drawing-plugin-ratio-point");
                bindPointerDown(diamond);
                svg.appendChild(diamond);

                const label = object.data && object.data.label;
                if (label && (!object.style || object.style.showLabel !== false)) {
                    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
                    text.setAttribute("x", position.x + size + 5);
                    text.setAttribute("y", position.y - size - 2);
                    text.setAttribute("class", "drawing-label drawing-plugin-ratio-label");
                    text.setAttribute("font-size", String(object.style && object.style.fontSize || 14));
                    text.textContent = label;
                    bindPointerDown(text);
                    svg.appendChild(text);
                }
                return true;
            },
        }],
        tools: [{
            id: TOOL_ID,
            commandId: "ratio_point",
            label: "Punkt w proporcji",
            group: "geometry-points",
            groupLabel: "Punkty i przecięcia",
            modes: ["geometry", "mixed"],
            order: 317.7,
            help: "Zaznacz dokładnie dwa zwykłe punkty geometryczne, ustaw parametr t i kliknij pusty obszar canvasu. Powstanie P=(1-t)A+tB.",
            async onCanvasClick({editor, selectedObjects, createObject, setStatus}) {
                const points = selectedObjects.filter((object) => object.type === "geometry.point");
                if (selectedObjects.length !== 2 || points.length !== 2) {
                    setStatus("Zaznacz dokładnie dwa obiekty geometry.point, a następnie kliknij pusty obszar canvasu.", true);
                    return {handled: true};
                }
                if (points[0].object_id === points[1].object_id) {
                    setStatus("Punkt w proporcji wymaga dwóch różnych punktów.", true);
                    return {handled: true};
                }
                const input = ratioInput(editor);
                const ratio = Number(input && input.value);
                if (!Number.isFinite(ratio) || ratio < 0 || ratio > 1) {
                    setStatus("Parametr t musi być liczbą od 0 do 1.", true);
                    return {handled: true};
                }
                const label = editor.labelInput ? editor.labelInput.value.trim() : "";
                const result = await createObject({
                    type: "geometry.ratio_point",
                    data: {
                        command: "ratio_point",
                        source: points[0].object_id,
                        target: points[1].object_id,
                        ratio,
                        label,
                    },
                    style: editor.styleForNewObject("geometry.ratio_point"),
                });
                editor.objects.push(result.object);
                editor.setSingleSelection(result.object.object_id);
                editor.pushHistory({kind: "create", object: result.object});
                editor.render();
                setStatus("Dodano punkt w proporcji t=" + ratio.toFixed(2) + ". Jego pozycja aktualizuje się razem z punktami bazowymi.");
                return {handled: true};
            },
        }],
    });
}());
