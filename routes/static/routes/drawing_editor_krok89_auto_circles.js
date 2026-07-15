(function () {
    "use strict";

    function getCookie(name) {
        const cookies = document.cookie ? document.cookie.split(";") : [];
        for (const rawCookie of cookies) {
            const cookie = rawCookie.trim();
            if (cookie.startsWith(name + "=")) {
                return decodeURIComponent(cookie.slice(name.length + 1));
            }
        }
        return null;
    }

    function svgPointFromEvent(svg, event) {
        const point = svg.createSVGPoint();
        point.x = event.clientX;
        point.y = event.clientY;
        return point.matrixTransform(svg.getScreenCTM().inverse());
    }

    function escapeHtml(value) {
        return String(value)
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    function isPointLike(object) {
        return object && (object.type === "geometry.point" || object.type === "graph.vertex");
    }

    function isGeometryPoint(object) {
        return Boolean(object && (object.type === "geometry.point" || isDerivedPoint(object)));
    }

    function isMidpoint(object) {
        return object && object.type === "geometry.midpoint";
    }

    function registeredObjectType(objectOrType) {
        const typeId = typeof objectOrType === "string" ? objectOrType : objectOrType && objectOrType.type;
        return typeId && window.RouteEditorPlugins ? window.RouteEditorPlugins.getObjectType(typeId) : null;
    }

    function isDerivedPoint(object) {
        const definition = registeredObjectType(object);
        return isMidpoint(object) || Boolean(definition && definition.pointLike && definition.resolvePosition);
    }

    function isGraphVertex(object) {
        return object && object.type === "graph.vertex";
    }

    function isLineLike(object) {
        return object.type === "geometry.segment" || object.type === "graph.edge";
    }

    function isCircleLike(object) {
        return object.type === "geometry.circle";
    }

    function isPolygonLike(object) {
        return object.type === "geometry.polygon";
    }

    function isGroup(object) {
        return object && object.type === "group";
    }

    function isRelativeLabel(object) {
        return object && object.type === "label.relative";
    }

    function isTextLike(object) {
        return object.type === "text.latex" || isRelativeLabel(object);
    }

    function isPlotSeriesLike(object) {
        return object.type === "plot.series" || object.type === "plot.chart";
    }

    function isPositionedObject(object) {
        const definition = registeredObjectType(object);
        return isPointLike(object) || isTextLike(object) || Boolean(definition && definition.positioned);
    }

    function pointRadius(object) {
        const radius = object.style && Number(object.style.radius);
        return Number.isFinite(radius) && radius > 0 ? radius : 6;
    }

    function strokeWidth(object) {
        const width = object.style && Number(object.style.strokeWidth);
        return Number.isFinite(width) && width > 0 ? width : 2;
    }

    function shouldShowLabel(object) {
        return !(object.style && object.style.showLabel === false);
    }

    function opacityValue(value, fallback = 1) {
        const number = Number(value);
        if (!Number.isFinite(number)) {
            return fallback;
        }
        return Math.max(0, Math.min(1, number));
    }

    function lineDashArray(object) {
        const dash = object && object.style && object.style.lineDash;
        if (dash === "dashed") {
            return "10 6";
        }
        if (dash === "dotted") {
            return "2 6";
        }
        return "";
    }

    function fontSize(object, fallback = 14) {
        const size = object && object.style && Number(object.style.fontSize);
        return Number.isFinite(size) && size > 0 ? size : fallback;
    }

    function labelPosition(object, fallback = "above-right") {
        const allowed = new Set(["above-right", "above", "above-left", "right", "center", "left", "below-right", "below", "below-left"]);
        const value = object && object.style && object.style.labelPosition;
        return allowed.has(value) ? value : fallback;
    }

    function labelPlacement(object, distance = 14, fallback = "above-right") {
        const position = labelPosition(object, fallback);
        const map = {
            "above-right": {dx: distance, dy: -distance, anchor: "start", baseline: "auto"},
            "above": {dx: 0, dy: -distance, anchor: "middle", baseline: "auto"},
            "above-left": {dx: -distance, dy: -distance, anchor: "end", baseline: "auto"},
            "right": {dx: distance, dy: 0, anchor: "start", baseline: "middle"},
            "center": {dx: 0, dy: 0, anchor: "middle", baseline: "middle"},
            "left": {dx: -distance, dy: 0, anchor: "end", baseline: "middle"},
            "below-right": {dx: distance, dy: distance, anchor: "start", baseline: "hanging"},
            "below": {dx: 0, dy: distance, anchor: "middle", baseline: "hanging"},
            "below-left": {dx: -distance, dy: distance, anchor: "end", baseline: "hanging"},
        };
        return map[position] || map[fallback] || map["above-right"];
    }

    function applyLineStyle(element, object) {
        const dash = lineDashArray(object);
        if (dash) {
            element.setAttribute("stroke-dasharray", dash);
        }
        element.setAttribute("stroke-opacity", opacityValue(object && object.style && object.style.strokeOpacity, 1));
    }

    function applyFillStyle(element, object) {
        element.setAttribute("fill-opacity", opacityValue(object && object.style && object.style.fillOpacity, 1));
    }

    function applyTextStyle(element, object, fallbackSize = 14) {
        element.setAttribute("font-size", fontSize(object, fallbackSize));
        element.setAttribute("fill-opacity", opacityValue(object && object.style && object.style.strokeOpacity, 1));
    }

    function normalizeColor(value, fallback) {
        if (typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value)) {
            return value;
        }
        return fallback;
    }

    function numberFromInput(input, fallback) {
        const value = input ? Number(input.value) : NaN;
        return Number.isFinite(value) && value > 0 ? value : fallback;
    }

    function closestDrawingObjectId(target) {
        let element = target;
        while (element && element.nodeType === 1) {
            if (element.dataset && element.dataset.objectId) {
                return element.dataset.objectId;
            }
            element = element.parentNode;
        }
        return null;
    }

    function objectIsVisible(object) {
        return !(object && object.style && object.style.visible === false);
    }

    class DrawingEditor {
        constructor(root) {
            this.root = root;
            this.sidePanel = root.querySelector("[data-role='edit-drawer']");
            this.panelTabButtons = Array.from(root.querySelectorAll("[data-panel-tab]"));
            this.panelTabSections = Array.from(root.querySelectorAll("[data-panel-tab-panel]"));
            this.closeEditDrawerButton = root.querySelector("[data-action='close-edit-drawer']");
            this.svg = root.querySelector("[data-role='drawing-canvas']");
            this.status = root.querySelector("[data-role='drawing-status']");
            this.objectCount = root.querySelector("[data-role='object-count']");
            this.objectList = root.querySelector("[data-role='object-list']");
            this.objectTypeSelect = root.querySelector("[data-role='object-type']");
            this.toolButtons = Array.from(root.querySelectorAll("[data-tool-button]"));
            this.selectionCount = root.querySelector("[data-role='selection-count']");
            this.labelInput = root.querySelector("[data-role='object-label']");
            this.rotationAngleInput = root.querySelector("[data-role='rotation-angle']");
            this.homothetyScaleInput = root.querySelector("[data-role='homothety-scale']");
            this.incircleSideInput = root.querySelector("[data-role='incircle-side']");
            this.excenterVertexInput = root.querySelector("[data-role='excenter-vertex']");
            this.excircleVertexInput = root.querySelector("[data-role='excircle-vertex']");
            this.excircleSideInput = root.querySelector("[data-role='excircle-side']");
            this.contentPanel = root.querySelector("[data-role='content-panel']");
            this.contentLabelInput = root.querySelector("[data-role='content-label']");
            this.stylePanel = root.querySelector("[data-role='style-panel']");
            this.styleStrokeInput = root.querySelector("[data-role='style-stroke']");
            this.styleFillInput = root.querySelector("[data-role='style-fill']");
            this.styleStrokeWidthInput = root.querySelector("[data-role='style-stroke-width']");
            this.styleLineDashInput = root.querySelector("[data-role='style-line-dash']");
            this.styleStrokeOpacityInput = root.querySelector("[data-role='style-stroke-opacity']");
            this.styleFillOpacityInput = root.querySelector("[data-role='style-fill-opacity']");
            this.styleFontSizeInput = root.querySelector("[data-role='style-font-size']");
            this.styleLabelPositionInput = root.querySelector("[data-role='style-label-position']");
            this.styleRadiusInput = root.querySelector("[data-role='style-radius']");
            this.styleVisibleInput = root.querySelector("[data-role='style-visible']");
            this.styleShowLabelInput = root.querySelector("[data-role='style-show-label']");
            this.styleDirectedInput = root.querySelector("[data-role='style-directed']");
            this.defaultStylePanel = root.querySelector("[data-role='default-style-panel']");
            this.defaultStrokeInput = root.querySelector("[data-role='default-style-stroke']");
            this.defaultFillInput = root.querySelector("[data-role='default-style-fill']");
            this.defaultStrokeWidthInput = root.querySelector("[data-role='default-style-stroke-width']");
            this.defaultLineDashInput = root.querySelector("[data-role='default-style-line-dash']");
            this.defaultStrokeOpacityInput = root.querySelector("[data-role='default-style-stroke-opacity']");
            this.defaultFillOpacityInput = root.querySelector("[data-role='default-style-fill-opacity']");
            this.defaultFontSizeInput = root.querySelector("[data-role='default-style-font-size']");
            this.defaultLabelPositionInput = root.querySelector("[data-role='default-style-label-position']");
            this.defaultRadiusInput = root.querySelector("[data-role='default-style-radius']");
            this.defaultShowLabelInput = root.querySelector("[data-role='default-style-show-label']");
            this.settingsPanel = root.querySelector("[data-role='settings-panel']");
            this.settingsWidthInput = root.querySelector("[data-role='settings-width']");
            this.settingsHeightInput = root.querySelector("[data-role='settings-height']");
            this.settingsGridSizeInput = root.querySelector("[data-role='settings-grid-size']");
            this.settingsTikzScaleInput = root.querySelector("[data-role='settings-tikz-scale']");
            this.settingsShowGridInput = root.querySelector("[data-role='settings-show-grid']");
            this.settingsSnapToGridInput = root.querySelector("[data-role='settings-snap-to-grid']");
            this.plotPanel = root.querySelector("[data-role='plot-panel']");
            this.plotDataInput = root.querySelector("[data-role='plot-data']");
            this.plotFunctionsInput = root.querySelector("[data-role='plot-functions']");
            this.plotSeriesList = root.querySelector("[data-role='plot-series-list']");
            this.plotFunctionsList = root.querySelector("[data-role='plot-functions-list']");
            this.plotSeriesEditIndexInput = root.querySelector("[data-role='plot-series-edit-index']");
            this.plotSeriesLabelInput = root.querySelector("[data-role='plot-series-label']");
            this.plotSeriesColorInput = root.querySelector("[data-role='plot-series-color']");
            this.plotSeriesTypeSelect = root.querySelector("[data-role='plot-series-type']");
            this.plotSeriesPointsInput = root.querySelector("[data-role='plot-series-points']");
            this.plotFunctionEditIndexInput = root.querySelector("[data-role='plot-function-edit-index']");
            this.plotFunctionExpressionInput = root.querySelector("[data-role='plot-function-expression']");
            this.plotFunctionLabelInput = root.querySelector("[data-role='plot-function-label']");
            this.plotFunctionColorInput = root.querySelector("[data-role='plot-function-color']");
            this.plotFunctionMinInput = root.querySelector("[data-role='plot-function-min']");
            this.plotFunctionMaxInput = root.querySelector("[data-role='plot-function-max']");
            this.plotFunctionSamplesInput = root.querySelector("[data-role='plot-function-samples']");
            this.plotShowLegendInput = root.querySelector("[data-role='plot-show-legend']");
            this.plotTypeSelect = root.querySelector("[data-role='plot-type']");
            this.plotTitleInput = root.querySelector("[data-role='plot-title']");
            this.plotXLabelInput = root.querySelector("[data-role='plot-x-label']");
            this.plotYLabelInput = root.querySelector("[data-role='plot-y-label']");
            this.plotXMinInput = root.querySelector("[data-role='plot-x-min']");
            this.plotXMaxInput = root.querySelector("[data-role='plot-x-max']");
            this.plotYMinInput = root.querySelector("[data-role='plot-y-min']");
            this.plotYMaxInput = root.querySelector("[data-role='plot-y-max']");
            this.tikzPreviewPanel = root.querySelector("[data-role='tikz-preview-panel']") || document.querySelector("[data-role='tikz-preview-panel']");
            this.tikzPreviewTextarea = root.querySelector("[data-role='tikz-preview']") || document.querySelector("[data-role='tikz-preview']");
            this.tikzPreviewStatus = root.querySelector("[data-role='tikz-preview-status']") || document.querySelector("[data-role='tikz-preview-status']");
            this.copyTikzButton = root.querySelector("[data-action='copy-tikz']") || document.querySelector("[data-action='copy-tikz']");
            this.undoButton = root.querySelector("[data-action='undo']");
            this.redoButton = root.querySelector("[data-action='redo']");
            this.undoStack = [];
            this.redoStack = [];
            this.historyLimit = 100;
            this.historyStorageVersion = 1;
            this.historyStorageKey = "route-editor-history:" + (root.dataset.objectsUrl || window.location.pathname);
            this.selectedObjectId = null;
            this.selectedObjectIds = new Set();
            this.collapsedGroupIds = new Set();
            this.pendingLineStartId = null;
            this.pendingIntersectionPointIds = [];
            this.pendingProjectionPointIds = [];
            this.pendingSegmentProjectionPointIds = [];
            this.pendingCircleNearestPointIds = [];
            this.pendingLineCircleIntersectionPointIds = [];
            this.pendingCircleCircleIntersectionPointIds = [];
            this.pendingCircumcenterPointIds = [];
            this.pendingOrthocenterPointIds = [];
            this.pendingNinePointCenterPointIds = [];
            this.pendingCentroidPointIds = [];
            this.pendingIncenterPointIds = [];
            this.pendingExcenterPointIds = [];
            this.pendingIncircleTouchpointPointIds = [];
            this.pendingExcircleTouchpointPointIds = [];
            this.pendingExcircleTouchpointPointIds = [];
            this.pendingReflectionPointIds = [];
            this.pendingRotationPointIds = [];
            this.pendingCentralReflectionPointIds = [];
            this.pendingHomothetyPointIds = [];
            this.pendingTranslationPointIds = [];
            this.pendingPolygonPointIds = [];
            this.finishPolygonButton = root.querySelector("[data-action='finish-polygon']");
            this.cancelPolygonButton = root.querySelector("[data-action='cancel-polygon']");
            this.objects = [];
            this.objectsUrl = root.dataset.objectsUrl;
            this.settingsUrl = root.dataset.settingsUrl;
            this.tikzPreviewUrl = root.dataset.tikzPreviewUrl;
            this.drawingMode = root.dataset.drawingMode || "mixed";
            this.toolRegistry = window.RouteEditorToolRegistry || null;
            this.pluginPanels = root.querySelector("[data-role='plugin-panels']");
            this.pluginPropertiesPanel = root.querySelector("[data-role='plugin-properties']");
            this.pluginPropertiesTitle = root.querySelector("[data-role='plugin-properties-title']");
            this.pluginPropertiesHint = root.querySelector("[data-role='plugin-properties-hint']");
            this.pluginPropertiesFields = root.querySelector("[data-role='plugin-properties-fields']");
            this.pluginActionsPanel = root.querySelector("[data-role='plugin-actions']");
            this.pluginActionsTitle = root.querySelector("[data-role='plugin-actions-title']");
            this.pluginActionButtons = root.querySelector("[data-role='plugin-action-buttons']");
            this.registryUnsubscribe = null;
            this.csrfToken = getCookie("csrftoken");
            this.dragState = null;
            this.selectionBoxState = null;
            this.selectionBoxElement = null;
            this.ignoreNextCanvasClick = false;
            this.defaultStyleStorageKey = "drawing-editor-default-style";
            this.drawingSettings = this.settingsFromDataset();
            this.plotSeriesDrafts = [];
            this.plotFunctionDrafts = [];
            this.lastLoadedPlotDraftKey = null;
            this.loadDefaultStyleControls();
            this.loadSettingsControls();
            this.applySettingsToSvg();
            this.installRegisteredTools();
            this.restoreHistoryFromStorage();

            this.bindEvents();
            this.loadObjects();
        }

        installRegisteredTools() {
            if (!this.toolRegistry || !this.objectTypeSelect) {
                return;
            }
            const tools = this.toolRegistry.toolsForMode(this.drawingMode);
            const toolbox = this.root.querySelector("[data-role='toolbox']");

            // Krok 88: usuń dawną zbiorczą sekcję „Geometria”, jeżeli
            // pozostała w DOM-ie ze starszego szablonu lub pamięci podręcznej.
            // Narzędzia geometrii występują odtąd wyłącznie w sekcjach
            // tematycznych zdefiniowanych w rejestrze narzędzi.
            if (toolbox) {
                toolbox.querySelectorAll("[data-tool-group='geometry']").forEach((group) => group.remove());
            }

            const groups = new Map();
            Array.from(this.root.querySelectorAll("[data-tool-group]")).forEach((element) => {
                groups.set(element.dataset.toolGroup, element);
            });

            tools.forEach((tool) => {
                let option = Array.from(this.objectTypeSelect.options).find((item) => item.value === tool.id);
                if (!option) {
                    option = document.createElement("option");
                    option.value = tool.id;
                    this.objectTypeSelect.appendChild(option);
                }
                option.textContent = tool.label;

                let group = groups.get(tool.group);
                if (!group && toolbox) {
                    group = document.createElement("div");
                    group.className = "drawing-editor__tool-group drawing-editor__tool-group--plugin";
                    group.dataset.toolGroup = tool.group;
                    const title = document.createElement("span");
                    title.className = "drawing-editor__tool-group-title";
                    title.textContent = tool.groupLabel || "Dodatki";
                    group.appendChild(title);
                    toolbox.appendChild(group);
                    groups.set(tool.group, group);
                }

                if (group && !group.querySelector("[data-tool-button='" + CSS.escape(tool.id) + "']")) {
                    const button = document.createElement("button");
                    button.type = "button";
                    button.className = "drawing-editor__tool-button";
                    button.dataset.toolButton = tool.id;
                    button.textContent = tool.label;
                    group.appendChild(button);
                }

                if (tool.panelTemplate && this.pluginPanels && !this.pluginPanels.querySelector("[data-plugin-panel='" + CSS.escape(tool.id) + "']")) {
                    const panel = document.createElement("section");
                    panel.dataset.pluginPanel = tool.id;
                    panel.hidden = true;
                    panel.innerHTML = tool.panelTemplate;
                    this.pluginPanels.appendChild(panel);
                }
            });
            this.toolButtons = Array.from(this.root.querySelectorAll("[data-tool-button]"));
        }

        registeredTool(toolId = this.currentToolType()) {
            return this.toolRegistry ? this.toolRegistry.getTool(toolId) : null;
        }

        activateRegisteredTool(toolId, previousToolId = null) {
            const previous = this.registeredTool(previousToolId);
            const next = this.registeredTool(toolId);
            if (previous && typeof previous.onDeactivate === "function") {
                previous.onDeactivate({editor: this, root: this.root});
            }
            if (next && typeof next.onActivate === "function") {
                next.onActivate({editor: this, root: this.root});
            }
            if (this.pluginPanels) {
                this.pluginPanels.querySelectorAll("[data-plugin-panel]").forEach((panel) => {
                    panel.hidden = panel.dataset.pluginPanel !== toolId;
                });
            }
        }

        async runRegisteredCanvasHandler(toolId, event, point) {
            const tool = this.registeredTool(toolId);
            if (!tool || typeof tool.onCanvasClick !== "function") {
                return false;
            }
            const result = await tool.onCanvasClick({
                editor: this,
                event,
                point,
                tool,
                selectedObjects: this.selectedObjects(),
                createObject: (payload) => this.request(this.objectsUrl, {
                    method: "POST",
                    headers: {"Content-Type": "application/json"},
                    body: JSON.stringify(payload),
                }),
                setStatus: (message, isError = false) => this.setStatus(message, isError),
            });
            return result === true || (result && result.handled === true);
        }

        bindEvents() {
            this.svg.addEventListener("pointerdown", (event) => this.handleCanvasPointerDown(event));
            this.svg.addEventListener("click", (event) => this.handleCanvasClick(event));
            this.svg.addEventListener("pointermove", (event) => this.handlePointerMove(event));
            this.svg.addEventListener("pointerup", (event) => this.handlePointerUp(event));
            this.svg.addEventListener("pointercancel", (event) => this.handlePointerUp(event));

            if (this.objectTypeSelect) {
                this.objectTypeSelect.addEventListener("change", () => this.setToolType(this.objectTypeSelect.value));
            }

            this.toolButtons.forEach((button) => {
                button.addEventListener("click", () => this.setToolType(button.dataset.toolButton));
            });
            this.syncToolButtons();

            const deleteButton = this.root.querySelector("[data-action='delete-selected']");
            if (deleteButton) {
                deleteButton.addEventListener("click", () => this.deleteSelectedObject());
            }

            const duplicateButton = this.root.querySelector("[data-action='duplicate-selected']");
            if (duplicateButton) {
                duplicateButton.addEventListener("click", () => this.duplicateSelectedObject());
            }

            const groupButton = this.root.querySelector("[data-action='group-selected']");
            if (groupButton) {
                groupButton.addEventListener("click", () => this.groupSelectedObjects());
            }

            const ungroupButton = this.root.querySelector("[data-action='ungroup-selected']");
            if (ungroupButton) {
                ungroupButton.addEventListener("click", () => this.ungroupSelectedObjects());
            }

            const bringToFrontButton = this.root.querySelector("[data-action='bring-to-front']");
            if (bringToFrontButton) {
                bringToFrontButton.addEventListener("click", () => this.reorderSelectedObjects("front"));
            }

            const sendToBackButton = this.root.querySelector("[data-action='send-to-back']");
            if (sendToBackButton) {
                sendToBackButton.addEventListener("click", () => this.reorderSelectedObjects("back"));
            }

            const moveUpButton = this.root.querySelector("[data-action='move-up']");
            if (moveUpButton) {
                moveUpButton.addEventListener("click", () => this.reorderSelectedObjects("up"));
            }

            const moveDownButton = this.root.querySelector("[data-action='move-down']");
            if (moveDownButton) {
                moveDownButton.addEventListener("click", () => this.reorderSelectedObjects("down"));
            }

            if (this.undoButton) {
                this.undoButton.addEventListener("click", () => this.undoLastAction());
            }
            if (this.redoButton) {
                this.redoButton.addEventListener("click", () => this.redoLastAction());
            }
            if (this.finishPolygonButton) {
                this.finishPolygonButton.addEventListener("click", () => this.finishPendingPolygon());
            }
            if (this.cancelPolygonButton) {
                this.cancelPolygonButton.addEventListener("click", () => this.cancelPendingPolygon());
            }
            this.updatePolygonButtons();
            this.updateHistoryButtons();
            this.bindDefaultStyleEvents();

            const applySettingsButton = this.root.querySelector("[data-action='apply-settings']");
            if (applySettingsButton) {
                applySettingsButton.addEventListener("click", () => this.applyDrawingSettings());
            }

            const addPlotSeriesButton = this.root.querySelector("[data-action='add-plot-series']") || this.root.querySelector("[data-action='apply-plot-chart']");
            if (addPlotSeriesButton) {
                addPlotSeriesButton.addEventListener("click", () => this.addPlotSeriesFromPanel());
            }
            const applyPlotChartButton = this.root.querySelector("[data-action='apply-plot-chart']");
            if (applyPlotChartButton && applyPlotChartButton !== addPlotSeriesButton) {
                applyPlotChartButton.addEventListener("click", () => this.addPlotSeriesFromPanel());
            }
            const savePlotSeriesButton = this.root.querySelector("[data-action='save-plot-series']");
            if (savePlotSeriesButton) {
                savePlotSeriesButton.addEventListener("click", () => this.savePlotSeriesDraftFromForm());
            }
            const clearPlotSeriesFormButton = this.root.querySelector("[data-action='clear-plot-series-form']");
            if (clearPlotSeriesFormButton) {
                clearPlotSeriesFormButton.addEventListener("click", () => this.clearPlotSeriesForm());
            }
            const savePlotFunctionButton = this.root.querySelector("[data-action='save-plot-function']");
            if (savePlotFunctionButton) {
                savePlotFunctionButton.addEventListener("click", () => this.savePlotFunctionDraftFromForm());
            }
            const clearPlotFunctionFormButton = this.root.querySelector("[data-action='clear-plot-function-form']");
            if (clearPlotFunctionFormButton) {
                clearPlotFunctionFormButton.addEventListener("click", () => this.clearPlotFunctionForm());
            }

            const applyContentButton = this.root.querySelector("[data-action='apply-content']");
            if (applyContentButton) {
                applyContentButton.addEventListener("click", () => this.applySelectedContent());
            }
            const applyPluginPropertiesButton = this.root.querySelector("[data-action='apply-plugin-properties']");
            if (applyPluginPropertiesButton) {
                applyPluginPropertiesButton.addEventListener("click", () => this.applySelectedPluginProperties());
            }
            if (this.pluginActionButtons) {
                this.pluginActionButtons.addEventListener("click", (event) => {
                    const button = event.target.closest("[data-plugin-object-action]");
                    if (button) { this.runSelectedPluginAction(button.dataset.pluginObjectAction); }
                });
            }

            const applyStyleButton = this.root.querySelector("[data-action='apply-style']");
            if (applyStyleButton) {
                applyStyleButton.addEventListener("click", () => this.applySelectedStyle());
            }

            const previewTikzButton = this.root.querySelector("[data-action='preview-tikz']") || document.querySelector("[data-action='preview-tikz']");
            if (previewTikzButton) {
                previewTikzButton.addEventListener("click", () => this.previewTikz());
            }

            if (this.copyTikzButton) {
                this.copyTikzButton.addEventListener("click", () => this.copyTikzToClipboard());
            }

            const downloadSvgButton = this.root.querySelector("[data-action='download-svg']") || document.querySelector("[data-action='download-svg']");
            if (downloadSvgButton) {
                downloadSvgButton.addEventListener("click", () => this.downloadSvg());
            }

            const downloadPngButton = this.root.querySelector("[data-action='download-png']") || document.querySelector("[data-action='download-png']");
            if (downloadPngButton) {
                downloadPngButton.addEventListener("click", () => this.downloadPng());
            }

            this.panelTabButtons.forEach((button) => {
                button.addEventListener("click", () => this.selectPanelTab(button.dataset.panelTab));
            });
            if (this.closeEditDrawerButton && this.sidePanel) {
                this.closeEditDrawerButton.addEventListener("click", () => {
                    this.sidePanel.open = false;
                });
            }
            document.addEventListener("pointerdown", (event) => {
                if (!this.sidePanel || !this.sidePanel.open) {
                    return;
                }
                if (this.sidePanel.contains(event.target)) {
                    return;
                }
                this.sidePanel.open = false;
            });
        }

        selectPanelTab(tabName) {
            const selectedTab = tabName || "object";
            this.panelTabButtons.forEach((button) => {
                const isActive = button.dataset.panelTab === selectedTab;
                button.classList.toggle("drawing-editor__drawer-tab-button--active", isActive);
                button.setAttribute("aria-selected", isActive ? "true" : "false");
            });
            this.panelTabSections.forEach((section) => {
                const isActive = section.dataset.panelTabPanel === selectedTab;
                section.hidden = !isActive;
                section.classList.toggle("drawing-editor__drawer-section--active", isActive);
            });
        }

        openEditPanel(tabName) {
            if (this.sidePanel) {
                this.sidePanel.open = true;
            }
            this.selectPanelTab(tabName || "object");
        }

        styleFieldElement(name) {
            return this.stylePanel ? this.stylePanel.querySelector(`[data-style-field="${name}"]`) : null;
        }

        setStyleFieldVisible(name, visible) {
            const element = this.styleFieldElement(name);
            if (element) {
                element.hidden = !visible;
            }
        }

        updateVisibleStyleFields(object) {
            if (!object) {
                ["stroke", "fill", "stroke-width", "line-dash", "stroke-opacity", "fill-opacity", "font-size", "label-position", "radius", "show-label", "directed"].forEach((name) => this.setStyleFieldVisible(name, true));
                return;
            }
            const point = isPointLike(object);
            const lineLike = isLineLike(object) || isCircleLike(object) || isPolygonLike(object);
            const textLike = isTextLike(object);
            const plotLike = isPlotSeriesLike(object);
            this.setStyleFieldVisible("stroke", !textLike || object.type === "text.latex");
            this.setStyleFieldVisible("fill", point || isPolygonLike(object) || textLike || plotLike || isCircleLike(object));
            this.setStyleFieldVisible("stroke-width", lineLike || point || plotLike);
            this.setStyleFieldVisible("line-dash", lineLike || plotLike);
            this.setStyleFieldVisible("stroke-opacity", !plotLike);
            this.setStyleFieldVisible("fill-opacity", point || isPolygonLike(object) || isCircleLike(object) || textLike);
            this.setStyleFieldVisible("font-size", textLike || !plotLike);
            this.setStyleFieldVisible("label-position", !plotLike);
            this.setStyleFieldVisible("radius", point);
            this.setStyleFieldVisible("show-label", !plotLike);
            this.setStyleFieldVisible("directed", object.type === "graph.edge");
        }

        cloneObject(object) {
            return JSON.parse(JSON.stringify(object));
        }

        supportedHistoryKinds() {
            return new Set(["create", "delete", "update", "bulk-create", "bulk-delete", "bulk-update"]);
        }

        isValidHistoryCommand(command) {
            return Boolean(command && typeof command === "object" && this.supportedHistoryKinds().has(command.kind));
        }

        historySnapshot(object) {
            if (!object || typeof object !== "object" || !object.object_id) {
                return null;
            }
            return {
                object_id: object.object_id,
                type: object.type,
                data: this.cloneObject(object.data || {}),
                style: this.cloneObject(object.style || {}),
                order: Number.isFinite(Number(object.order)) ? Number(object.order) : 0,
            };
        }

        historySnapshotsEqual(left, right) {
            const a = this.historySnapshot(left);
            const b = this.historySnapshot(right);
            return Boolean(a && b && JSON.stringify(a) === JSON.stringify(b));
        }

        historyStateFromObjects(objects = this.objects) {
            return new Map((objects || [])
                .filter((object) => object && object.object_id)
                .map((object) => [object.object_id, this.historySnapshot(object)]));
        }

        canApplyHistoryCommand(command, direction, state) {
            if (!this.isValidHistoryCommand(command)) { return false; }
            const existsAs = (snapshot) => {
                const current = snapshot && state.get(snapshot.object_id);
                return Boolean(current && this.historySnapshotsEqual(current, snapshot));
            };
            const isAbsent = (snapshot) => Boolean(snapshot && !state.has(snapshot.object_id));
            const all = (items, predicate) => Array.isArray(items) && items.every(predicate);

            if (command.kind === "create") {
                return direction === "undo" ? existsAs(command.object) : isAbsent(command.object);
            }
            if (command.kind === "delete") {
                return direction === "undo" ? isAbsent(command.object) : existsAs(command.object);
            }
            if (command.kind === "update") {
                return direction === "undo" ? existsAs(command.after) : existsAs(command.before);
            }
            if (["bulk-create"].includes(command.kind)) {
                return direction === "undo"
                    ? all(command.objects, existsAs)
                    : all(command.objects, isAbsent);
            }
            if (command.kind === "bulk-delete") {
                return direction === "undo"
                    ? all(command.objects, isAbsent)
                    : all(command.objects, existsAs);
            }
            if (command.kind === "bulk-update") {
                return direction === "undo"
                    ? all(command.after, existsAs)
                    : all(command.before, existsAs);
            }
            return false;
        }

        simulateHistoryCommand(command, direction, state) {
            const put = (snapshot) => {
                const value = this.historySnapshot(snapshot);
                if (value) { state.set(value.object_id, value); }
            };
            const remove = (snapshot) => {
                if (snapshot && snapshot.object_id) { state.delete(snapshot.object_id); }
            };
            const each = (items, callback) => (items || []).forEach(callback);

            if (command.kind === "create") {
                direction === "undo" ? remove(command.object) : put(command.object);
            } else if (command.kind === "delete") {
                direction === "undo" ? put(command.object) : remove(command.object);
            } else if (command.kind === "update") {
                put(direction === "undo" ? command.before : command.after);
            } else if (["bulk-create"].includes(command.kind)) {
                each(command.objects, direction === "undo" ? remove : put);
            } else if (command.kind === "bulk-delete") {
                each(command.objects, direction === "undo" ? put : remove);
            } else if (command.kind === "bulk-update") {
                each(direction === "undo" ? command.before : command.after, put);
            }
        }

        reconcileHistoryStack(stack, direction, initialState) {
            const state = new Map(initialState);
            const retainedFromNewest = [];
            let discarded = 0;
            for (let index = (stack || []).length - 1; index >= 0; index -= 1) {
                const command = stack[index];
                if (!this.canApplyHistoryCommand(command, direction, state)) {
                    discarded += 1;
                    continue;
                }
                retainedFromNewest.push(command);
                this.simulateHistoryCommand(command, direction, state);
            }
            return {
                stack: retainedFromNewest.reverse(),
                discarded,
            };
        }

        reconcileHistoryWithObjects() {
            const currentState = this.historyStateFromObjects();
            const undoResult = this.reconcileHistoryStack(this.undoStack, "undo", currentState);
            const redoResult = this.reconcileHistoryStack(this.redoStack, "redo", currentState);
            this.undoStack = undoResult.stack;
            this.redoStack = redoResult.stack;
            const discarded = undoResult.discarded + redoResult.discarded;
            if (discarded > 0) {
                this.persistHistory();
            }
            this.updateHistoryButtons();
            return discarded;
        }

        persistHistory() {
            try {
                const payload = {
                    version: this.historyStorageVersion,
                    undoStack: this.undoStack.slice(-this.historyLimit),
                    redoStack: this.redoStack.slice(-this.historyLimit),
                };
                window.localStorage.setItem(this.historyStorageKey, JSON.stringify(payload));
            } catch (error) {
                // Historia jest udogodnieniem. Brak localStorage nie może zablokować edytora.
                console.warn("Nie udało się zapisać historii Route Editora.", error);
            }
        }

        restoreHistoryFromStorage() {
            try {
                const raw = window.localStorage.getItem(this.historyStorageKey);
                if (!raw) {
                    this.updateHistoryButtons();
                    return;
                }
                const payload = JSON.parse(raw);
                if (!payload || payload.version !== this.historyStorageVersion) {
                    window.localStorage.removeItem(this.historyStorageKey);
                    this.updateHistoryButtons();
                    return;
                }
                const sanitize = (items) => (Array.isArray(items) ? items : [])
                    .filter((command) => this.isValidHistoryCommand(command))
                    .slice(-this.historyLimit)
                    .map((command) => this.cloneObject(command));
                this.undoStack = sanitize(payload.undoStack);
                this.redoStack = sanitize(payload.redoStack);
            } catch (error) {
                this.undoStack = [];
                this.redoStack = [];
                try { window.localStorage.removeItem(this.historyStorageKey); } catch (_) {}
                console.warn("Nie udało się odtworzyć historii Route Editora.", error);
            }
            this.updateHistoryButtons();
        }

        clearPersistentHistory() {
            this.undoStack = [];
            this.redoStack = [];
            try { window.localStorage.removeItem(this.historyStorageKey); } catch (_) {}
            this.updateHistoryButtons();
        }

        pushHistory(command) {
            if (!this.isValidHistoryCommand(command)) {
                throw new Error("Nieobsługiwany typ operacji historii.");
            }
            this.undoStack.push(this.cloneObject(command));
            if (this.undoStack.length > this.historyLimit) {
                this.undoStack.shift();
            }
            this.redoStack = [];
            this.persistHistory();
            this.updateHistoryButtons();
        }

        updateHistoryButtons() {
            if (this.undoButton) {
                this.undoButton.disabled = this.undoStack.length === 0;
            }
            if (this.redoButton) {
                this.redoButton.disabled = this.redoStack.length === 0;
            }
        }

        groupChildIds(object) {
            if (!isGroup(object)) { return []; }
            const ids = object.data && object.data.childObjectIds;
            return Array.isArray(ids) ? ids.filter((id) => typeof id === "string" && id) : [];
        }

        childObjects(object) {
            if (!object || typeof object !== "object") { return []; }
            if (isGroup(object)) {
                const byId = new Map((this.objects || []).map((candidate) => [candidate.object_id, candidate]));
                return this.groupChildIds(object).map((id) => byId.get(id)).filter(Boolean);
            }
            if (Array.isArray(object.children)) {
                return object.children.filter((child) => child && typeof child === "object");
            }
            if (object.data && Array.isArray(object.data.children)) {
                return object.data.children.filter((child) => child && typeof child === "object");
            }
            return [];
        }

        rootObjects(objects = this.objects) {
            const source = Array.isArray(objects) ? objects : [];
            if (source !== this.objects) { return source; }
            const contained = new Set();
            for (const object of source) {
                this.groupChildIds(object).forEach((id) => contained.add(id));
            }
            return source.filter((object) => !contained.has(object.object_id));
        }

        // Krok 45 API: walkObjects(objects = this.objects, visitor = () => {})
        walkObjects(objects = null, visitor = () => {}) {
            const roots = objects === null ? this.rootObjects() : (Array.isArray(objects) ? objects : []);
            const activePath = new Set();
            const visitedIds = new Set();
            const walk = (items, parent = null, depth = 0) => {
                for (const object of items) {
                    if (!object || typeof object !== "object" || activePath.has(object)) { continue; }
                    if (object.object_id && visitedIds.has(object.object_id)) { continue; }
                    if (object.object_id) { visitedIds.add(object.object_id); }
                    activePath.add(object);
                    visitor(object, {parent, depth});
                    walk(this.childObjects(object), object, depth + 1);
                    activePath.delete(object);
                }
            };
            walk(roots);
        }

        // Krok 45 API: objectTreeEntries(objects = this.objects)
        objectTreeEntries(objects = null) {
            const entries = [];
            this.walkObjects(objects, (object, context) => entries.push({object, ...context}));
            return entries;
        }

        visibleObjectTreeEntries() {
            const hiddenByCollapsedAncestor = new Set();
            const entries = [];
            for (const entry of this.objectTreeEntries()) {
                const parentId = entry.parent && entry.parent.object_id;
                if (parentId && (hiddenByCollapsedAncestor.has(parentId) || this.collapsedGroupIds.has(parentId))) {
                    hiddenByCollapsedAncestor.add(entry.object.object_id);
                    continue;
                }
                entries.push(entry);
            }
            return entries;
        }

        toggleGroupCollapsed(objectId) {
            const object = this.findObject(objectId);
            if (!isGroup(object)) { return; }
            if (this.collapsedGroupIds.has(objectId)) {
                this.collapsedGroupIds.delete(objectId);
            } else {
                this.collapsedGroupIds.add(objectId);
            }
            this.renderObjectList();
        }

        async renameGroup(objectId) {
            const group = this.findObject(objectId);
            if (!isGroup(group)) { return; }
            const currentName = (group.data && group.data.name) || "Grupa";
            const proposedName = window.prompt("Nowa nazwa grupy:", currentName);
            if (proposedName === null) { return; }
            const name = proposedName.trim();
            if (!name) {
                this.setStatus("Nazwa grupy nie może być pusta.", true);
                return;
            }
            try {
                const before = this.cloneObject(group);
                const result = await this.request(this.objectDetailUrl(group.object_id), {
                    method: "PATCH",
                    headers: {"Content-Type": "application/json"},
                    body: JSON.stringify({data: {...(group.data || {}), name}}),
                });
                this.replaceObjectInMemory(result.object);
                this.pushHistory({kind: "update", before, after: result.object});
                this.render();
                this.setStatus("Zmieniono nazwę grupy na „" + name + "”.");
            } catch (error) {
                this.setStatus("Nie udało się zmienić nazwy grupy: " + error.message, true);
            }
        }

        hasSelectedAncestor(objectId) {
            let entry = this.objectTreeEntries().find((item) => item.object.object_id === objectId);
            while (entry && entry.parent) {
                if (this.isSelected(entry.parent.object_id)) { return true; }
                entry = this.objectTreeEntries().find((item) => item.object.object_id === entry.parent.object_id);
            }
            return false;
        }

        // Krok 45 API: flattenObjects(objects = this.objects)
        flattenObjects(objects = null) {
            return this.objectTreeEntries(objects).map((entry) => entry.object);
        }

        groupDescendants(group, includeGroup = false) {
            if (!isGroup(group)) { return includeGroup && group ? [group] : []; }
            const result = includeGroup ? [group] : [];
            this.walkObjects(this.childObjects(group), (object) => result.push(object));
            return result;
        }

        expandGroups(objects, includeGroups = true) {
            const result = [];
            const seen = new Set();
            const add = (object) => {
                if (!object || seen.has(object.object_id)) { return; }
                seen.add(object.object_id);
                result.push(object);
            };
            for (const object of (objects || [])) {
                if (includeGroups) { add(object); }
                if (isGroup(object)) {
                    this.groupDescendants(object).forEach(add);
                } else if (!includeGroups) {
                    add(object);
                }
            }
            return result;
        }

        replaceObjectInMemory(object) {
            const index = this.objects.findIndex((candidate) => candidate.object_id === object.object_id);
            if (index >= 0) {
                this.objects[index] = object;
            } else {
                this.objects.push(object);
            }
        }

        filterObjectTree(objects, removedIds) {
            return (Array.isArray(objects) ? objects : [])
                .filter((object) => !removedIds.has(object.object_id))
                .map((object) => {
                    if (isGroup(object)) {
                        object.data = {...(object.data || {}), childObjectIds: this.groupChildIds(object).filter((id) => !removedIds.has(id))};
                    }
                    return object;
                });
        }

        removeObjectFromMemory(objectId) {
            const removedIds = this.dependencyClosureIds([objectId]);
            this.objects = this.filterObjectTree(this.objects, removedIds);
            if (removedIds.has(this.pendingLineStartId)) {
                this.pendingLineStartId = null;
            }
            this.pendingPolygonPointIds = (this.pendingPolygonPointIds || []).filter((id) => !removedIds.has(id));
            this.updatePolygonButtons();
            if (this.selectedObjectIds) {
                removedIds.forEach((id) => this.selectedObjectIds.delete(id));
            }
            if (removedIds.has(this.selectedObjectId)) {
                this.selectedObjectId = this.selectedIds ? (this.selectedIds()[0] || null) : null;
            }
        }

        objectPayload(object) {
            return {
                object_id: object.object_id,
                type: object.type,
                data: this.cloneObject(object.data || {}),
                style: this.cloneObject(object.style || {}),
                order: Number.isFinite(Number(object.order)) ? Number(object.order) : 0,
            };
        }

        async restoreObject(object) {
            const payload = this.objectPayload(object);
            const result = await this.request(this.objectsUrl, {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify(payload),
            });
            this.replaceObjectInMemory(result.object);
            this.setSingleSelection(result.object.object_id);
            return result.object;
        }

        async deleteObjectById(objectId) {
            await this.request(this.objectDetailUrl(objectId), {method: "DELETE"});
            this.removeObjectFromMemory(objectId);
        }

        async applyObjectSnapshot(object) {
            const payload = {
                type: object.type,
                data: this.cloneObject(object.data || {}),
                style: this.cloneObject(object.style || {}),
                order: Number.isFinite(Number(object.order)) ? Number(object.order) : 0,
            };
            const result = await this.request(this.objectDetailUrl(object.object_id), {
                method: "PATCH",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify(payload),
            });
            this.replaceObjectInMemory(result.object);
            this.setSingleSelection(result.object.object_id);
            return result.object;
        }

        async executeHistoryCommand(command, direction) {
            if (command.kind === "create") {
                if (direction === "undo") {
                    await this.deleteObjectById(command.object.object_id);
                } else {
                    await this.restoreObject(command.object);
                }
                return;
            }

            if (command.kind === "delete") {
                if (direction === "undo") {
                    await this.restoreObject(command.object);
                } else {
                    await this.deleteObjectById(command.object.object_id);
                }
                return;
            }

            if (command.kind === "bulk-create") {
                if (direction === "undo") {
                    // Kopie są zapisane w kolejności zależności. Usuwamy je odwrotnie,
                    // aby obiekty zależne zniknęły przed swoimi bazami.
                    for (const object of [...(command.objects || [])].reverse()) {
                        await this.deleteObjectById(object.object_id);
                    }
                } else {
                    for (const object of command.objects || []) {
                        await this.restoreObject(object);
                    }
                }
                return;
            }

            if (command.kind === "bulk-delete") {
                if (direction === "undo") {
                    for (const object of command.objects || []) {
                        await this.restoreObject(object);
                    }
                } else {
                    await Promise.all((command.objects || []).map((object) => this.deleteObjectById(object.object_id)));
                }
                return;
            }

            if (command.kind === "bulk-update") {
                const snapshots = direction === "undo" ? command.before : command.after;
                for (const snapshot of snapshots || []) {
                    await this.applyObjectSnapshot(snapshot);
                }
                return;
            }

            if (command.kind === "update") {
                const snapshot = direction === "undo" ? command.before : command.after;
                await this.applyObjectSnapshot(snapshot);
            }
        }

        async undoLastAction() {
            this.reconcileHistoryWithObjects();
            const command = this.undoStack.pop();
            if (!command) {
                this.updateHistoryButtons();
                this.setStatus("Nie ma operacji do cofnięcia.", true);
                return;
            }

            try {
                await this.executeHistoryCommand(command, "undo");
                this.redoStack.push(command);
                this.persistHistory();
                this.render();
                this.updateHistoryButtons();
                this.setStatus("Cofnięto ostatnią operację.");
            } catch (error) {
                this.undoStack.push(command);
                this.persistHistory();
                this.updateHistoryButtons();
                this.setStatus("Nie udało się cofnąć operacji: " + error.message, true);
            }
        }

        async redoLastAction() {
            this.reconcileHistoryWithObjects();
            const command = this.redoStack.pop();
            if (!command) {
                this.updateHistoryButtons();
                this.setStatus("Nie ma operacji do ponowienia.", true);
                return;
            }

            try {
                await this.executeHistoryCommand(command, "redo");
                this.undoStack.push(command);
                this.persistHistory();
                this.render();
                this.updateHistoryButtons();
                this.setStatus("Ponowiono operację.");
            } catch (error) {
                this.redoStack.push(command);
                this.persistHistory();
                this.updateHistoryButtons();
                this.setStatus("Nie udało się ponowić operacji: " + error.message, true);
            }
        }

        clearPendingToolState() {
            this.pendingLineStartId = null;
            this.pendingIntersectionPointIds = [];
            this.pendingProjectionPointIds = [];
            this.pendingSegmentProjectionPointIds = [];
            this.pendingCircleNearestPointIds = [];
            this.pendingLineCircleIntersectionPointIds = [];
            this.pendingCircleCircleIntersectionPointIds = [];
            this.pendingCircumcenterPointIds = [];
            this.pendingOrthocenterPointIds = [];
            this.pendingNinePointCenterPointIds = [];
            this.pendingCentroidPointIds = [];
            this.pendingIncenterPointIds = [];
            this.pendingExcenterPointIds = [];
            this.pendingIncircleTouchpointPointIds = [];
            this.pendingReflectionPointIds = [];
            this.pendingRotationPointIds = [];
            this.pendingCentralReflectionPointIds = [];
            this.pendingHomothetyPointIds = [];
            this.pendingTranslationPointIds = [];
            this.pendingPolygonPointIds = [];
            this.updatePolygonButtons();
        }

        availableToolTypes() {
            return new Set(Array.from(this.objectTypeSelect ? this.objectTypeSelect.options : []).map((option) => option.value));
        }

        isToolAllowed(toolType) {
            return this.availableToolTypes().has(toolType);
        }

        setToolType(toolType) {
            if (!this.objectTypeSelect || !toolType) {
                return;
            }
            const option = Array.from(this.objectTypeSelect.options).find((item) => item.value === toolType);
            if (!option) {
                this.setStatus("To narzędzie nie jest dostępne w trybie tego rysunku.", true);
                return;
            }
            const previousToolType = this.currentToolType();
            this.objectTypeSelect.value = toolType;
            this.clearPendingToolState();
            this.activateRegisteredTool(toolType, previousToolType);
            this.syncToolButtons();
            this.setStatus(this.helpTextForCurrentTool());
            this.render();
        }

        syncToolButtons() {
            const currentTool = this.currentToolType();
            this.toolButtons.forEach((button) => {
                const isActive = button.dataset.toolButton === currentTool;
                button.classList.toggle("drawing-editor__tool-button--active", isActive);
                button.setAttribute("aria-pressed", isActive ? "true" : "false");
            });
        }

        currentToolType() {
            return this.objectTypeSelect ? this.objectTypeSelect.value : "geometry.point";
        }

        isGraphEdgeTool(toolType = this.currentToolType()) {
            return toolType === "graph.edge" || toolType === "graph.edge.directed" || toolType === "graph.edge.undirected";
        }

        graphEdgeToolIsDirected(toolType = this.currentToolType()) {
            // Legacy value graph.edge used to mean a directed graph edge.
            return toolType === "graph.edge" || toolType === "graph.edge.directed";
        }

        objectTypeForTool(toolType = this.currentToolType()) {
            return this.isGraphEdgeTool(toolType) ? "graph.edge" : toolType;
        }

        currentToolCreatesLine() {
            const selectedType = this.currentToolType();
            return selectedType === "geometry.segment" || this.isGraphEdgeTool(selectedType);
        }

        currentToolCreatesRelativeLabel() {
            return this.currentToolType() === "label.relative";
        }

        currentToolCreatesMidpoint() {
            return this.currentToolType() === "geometry.midpoint";
        }

        currentToolCreatesLineIntersection() {
            return this.currentToolType() === "geometry.line_intersection";
        }

        currentToolCreatesPerpendicularProjection() {
            return this.currentToolType() === "geometry.perpendicular_projection";
        }

        currentToolCreatesSegmentProjection() {
            return this.currentToolType() === "geometry.segment_projection";
        }

        currentToolCreatesCircleNearestPoint() {
            return this.currentToolType() === "geometry.circle_nearest_point";
        }

        currentToolCreatesLineCircleIntersection() {
            return this.currentToolType() === "geometry.line_circle_intersection";
        }

        currentToolCreatesCircleCircleIntersection() {
            return this.currentToolType() === "geometry.circle_circle_intersection";
        }

        currentToolCreatesCircumcenter() {
            return this.currentToolType() === "geometry.circumcenter";
        }

        currentToolCreatesOrthocenter() {
            return this.currentToolType() === "geometry.orthocenter";
        }

        currentToolCreatesNinePointCenter() {
            return this.currentToolType() === "geometry.nine_point_center";
        }

        currentToolCreatesCentroid() {
            return this.currentToolType() === "geometry.centroid";
        }

        currentToolCreatesIncenter() {
            return this.currentToolType() === "geometry.incenter";
        }

        currentToolCreatesExcenter() {
            return this.currentToolType() === "geometry.excenter";
        }

        currentToolCreatesExcircleTouchpoint() {
            return this.currentToolType() === "geometry.excircle_touchpoint";
        }

        currentToolCreatesIncircleTouchpoint() {
            return this.currentToolType() === "geometry.incircle_touchpoint";
        }

        currentToolCreatesReflectionAcrossLine() {
            return this.currentToolType() === "geometry.reflection_across_line";
        }

        currentToolCreatesRotationAroundPoint() {
            return this.currentToolType() === "geometry.rotation_around_point";
        }

        currentToolCreatesCentralReflection() {
            return this.currentToolType() === "geometry.central_reflection";
        }

        currentToolCreatesHomothety() {
            return this.currentToolType() === "geometry.homothety";
        }

        currentToolCreatesTranslationByVector() {
            return this.currentToolType() === "geometry.translation_by_vector";
        }

        currentToolCreatesCircle() {
            return this.currentToolType() === "geometry.circle";
        }

        currentToolCreatesPolygon() {
            return this.currentToolType() === "geometry.polygon";
        }

        currentToolCreatesByTwoPoints() {
            return this.currentToolCreatesLine() || this.currentToolCreatesCircle() || this.currentToolCreatesMidpoint();
        }

        currentToolSelectsOnly() {
            return this.currentToolType() === "select";
        }

        helpTextForCurrentTool() {
            const registered = this.registeredTool();
            if (registered && registered.help) {
                return typeof registered.help === "function" ? registered.help({editor: this}) : registered.help;
            }
            const commandRegistry = window.RouteEditorGeometryCommands;
            const command = registered && registered.commandId && commandRegistry ? commandRegistry.get(registered.commandId) : null;
            if (command && command.help) { return command.help; }
            if (this.currentToolType() === "plot.series") {
                return "Tryb wykresu z danych: wpisz punkty pod canvasem i kliknij Zastosuj dane wykresu. Wykres będzie odpowiadał dokładnie zawartości pola danych.";
            }
            if (this.currentToolSelectsOnly()) {
                return "Tryb zaznaczania: kliknij obiekt na rysunku, żeby go zaznaczyć. Ctrl/Shift-klik dodaje obiekty do zaznaczenia.";
            }
            if (this.currentToolCreatesMidpoint()) {
                return "Komenda środek odcinka: kliknij dwa istniejące punkty geometryczne. Powstały punkt zależny będzie zawsze leżał dokładnie w połowie między nimi.";
            }
            if (this.currentToolCreatesCircle()) {
                return "Tryb okręgu: kliknij miejsce środka, a potem miejsce na okręgu. Możesz też kliknąć istniejące punkty geometryczne. Wierzchołki grafu nie są używane w geometrii.";
            }
            if (this.currentToolCreatesLineIntersection()) {
                return "Kliknij kolejno cztery punkty: dwa dla pierwszej prostej i dwa dla drugiej.";
            }
            if (this.currentToolCreatesPerpendicularProjection()) {
                return "Kliknij punkt rzutowany, a następnie dwa różne punkty wyznaczające prostą.";
            }
            if (this.currentToolCreatesSegmentProjection()) {
                return "Kliknij punkt, a następnie dwa różne końce odcinka. Wynik pozostanie na odcinku.";
            }
            if (this.currentToolCreatesLineCircleIntersection()) {
                return "Kliknij dwa punkty prostej, środek okręgu i punkt wyznaczający promień.";
            }
            if (this.currentToolCreatesCircleCircleIntersection()) {
                return "Kliknij środek i punkt promienia pierwszego okręgu, a następnie środek i punkt promienia drugiego.";
            }
            if (this.currentToolCreatesCircumcenter()) {
                return "Kliknij trzy różne, niewspółliniowe punkty. Powstanie środek okręgu opisanego na trójkącie.";
            }

            if (this.currentToolCreatesOrthocenter()) {
                return "Kliknij trzy różne, niewspółliniowe punkty. Powstanie ortocentrum trójkąta.";
            }

            if (this.currentToolCreatesNinePointCenter()) {
                if (!this.pointIsAllowedForCurrentTool(object)) {
                    this.setStatus(this.currentToolPointErrorMessage(), true);
                    return;
                }
                if (this.pendingNinePointCenterPointIds.includes(objectId)) {
                    this.setStatus("Ten punkt został już wybrany. Wskaż inny punkt.", true);
                    return;
                }
                this.pendingNinePointCenterPointIds.push(objectId);
                this.setSingleSelection(objectId);
                this.render();
                const count = this.pendingNinePointCenterPointIds.length;
                if (count < 3) {
                    const descriptions = ["drugi punkt trójkąta", "trzeci punkt trójkąta"];
                    this.setStatus("Wybrano punkt " + count + "/3. Wskaż " + descriptions[count - 1] + ".");
                } else {
                    this.createNinePointCenter([...this.pendingNinePointCenterPointIds]);
                }
                return;
            }

            if (this.currentToolCreatesCentroid()) {
                return "Kliknij trzy różne punkty. Powstanie środek ciężkości trójkąta.";
            }

            if (this.currentToolCreatesIncenter()) {
                return "Kliknij trzy różne, niewspółliniowe punkty. Powstanie środek okręgu wpisanego.";
            }
            if (this.currentToolCreatesExcenter()) {
                return "Wybierz wierzchołek A, B lub C, a następnie kliknij trzy różne, niewspółliniowe punkty trójkąta.";
            }

            if (this.currentToolCreatesExcircleTouchpoint()) {
                if (!this.pointIsAllowedForCurrentTool(object)) { this.setStatus(this.currentToolPointErrorMessage(), true); return; }
                if (this.pendingExcircleTouchpointPointIds.includes(objectId)) { this.setStatus("Ten punkt został już wybrany. Wskaż inny punkt.", true); return; }
                this.pendingExcircleTouchpointPointIds.push(objectId); this.setSingleSelection(objectId); this.render();
                const count = this.pendingExcircleTouchpointPointIds.length;
                if (count < 3) { const descriptions=["drugi punkt trójkąta","trzeci punkt trójkąta"]; this.setStatus("Wybrano punkt " + count + "/3. Wskaż " + descriptions[count-1] + "."); }
                else { this.createExcircleTouchpoint([...this.pendingExcircleTouchpointPointIds]); }
                return;
            }

            if (this.currentToolCreatesIncircleTouchpoint()) {
                return "Wybierz bok AB, BC lub CA, a następnie kliknij trzy różne, niewspółliniowe wierzchołki trójkąta.";
            }

            if (this.currentToolCreatesReflectionAcrossLine()) {
                return "Kliknij punkt odbijany, a następnie dwa różne punkty wyznaczające prostą odbicia.";
            }
            if (this.currentToolCreatesRotationAroundPoint()) {
                return "Podaj kąt w stopniach, kliknij punkt obracany, a następnie środek obrotu.";
            }
            if (this.currentToolCreatesCentralReflection()) {
                return "Kliknij punkt odbijany, a następnie środek symetrii.";
            }
            if (this.currentToolCreatesHomothety()) {
                return "Podaj współczynnik k, kliknij punkt przekształcany, a następnie środek jednokładności.";
            }
            if (this.currentToolCreatesTranslationByVector()) {
                return "Kliknij punkt przesuwany, a następnie początek i koniec wektora translacji.";
            }

            if (this.currentToolCreatesPolygon()) {
                return "Tryb wielokąta: klikaj kolejne miejsca albo istniejące punkty geometryczne. Kliknij pierwszy punkt ponownie, żeby domknąć wielokąt.";
            }
            if (this.currentToolType() === "geometry.segment") {
                return "Tryb odcinka: kliknij dwa miejsca na canvasie albo istniejące punkty geometryczne. Brakujące punkty utworzą się automatycznie.";
            }
            if (this.isGraphEdgeTool()) {
                return "Tryb krawędzi grafowej: kliknij dwa istniejące wierzchołki graph.vertex. Kierunek krawędzi można później zmienić w panelu stylu.";
            }
            if (this.currentToolType() === "text.latex") {
                return "Tryb tekstu LaTeX: wpisz treść w polu etykiety i kliknij canvas, żeby dodać tekst. Tekst można później przeciągać.";
            }
            if (this.currentToolCreatesRelativeLabel()) {
                return "Tryb etykiety przypiętej: wpisz tekst, a następnie kliknij punkt lub wierzchołek. Etykieta zachowa offset i będzie przesuwać się razem z obiektem bazowym.";
            }
            return "Tryb punktu: kliknij pusty obszar, żeby dodać punkt, albo przeciągnij istniejący punkt.";
        }

        defaultStyleFromControls() {
            return {
                stroke: normalizeColor(this.defaultStrokeInput && this.defaultStrokeInput.value, "#111827"),
                fill: normalizeColor(this.defaultFillInput && this.defaultFillInput.value, "#ffffff"),
                strokeWidth: numberFromInput(this.defaultStrokeWidthInput, 2),
                lineDash: this.defaultLineDashInput ? this.defaultLineDashInput.value : "solid",
                strokeOpacity: opacityValue(this.defaultStrokeOpacityInput ? this.defaultStrokeOpacityInput.value : 1, 1),
                fillOpacity: opacityValue(this.defaultFillOpacityInput ? this.defaultFillOpacityInput.value : 1, 1),
                fontSize: numberFromInput(this.defaultFontSizeInput, 14),
                labelPosition: this.defaultLabelPositionInput ? this.defaultLabelPositionInput.value : "above-right",
                radius: numberFromInput(this.defaultRadiusInput, 6),
                showLabel: this.defaultShowLabelInput ? this.defaultShowLabelInput.checked : true,
            };
        }

        styleForNewObject(type) {
            const style = this.defaultStyleFromControls();
            const objectType = this.objectTypeForTool(type);
            if (objectType === "plot.series") {
                return {
                    stroke: style.stroke,
                    strokeWidth: style.strokeWidth,
                    lineDash: style.lineDash,
                    strokeOpacity: style.strokeOpacity,
                    showPoints: true,
                    showLabel: style.showLabel,
                };
            }
            if (objectType === "text.latex" || objectType === "label.relative") {
                return {
                    fill: style.stroke,
                    stroke: style.stroke,
                    strokeWidth: 1,
                    strokeOpacity: style.strokeOpacity,
                    fillOpacity: style.fillOpacity,
                    fontSize: style.fontSize || 18,
                    labelPosition: style.labelPosition,
                    showLabel: style.showLabel,
                };
            }
            if (objectType === "geometry.midpoint" || Boolean(registeredObjectType(objectType) && registeredObjectType(objectType).pointLike)) {
                return {
                    // Punkty wynikające z konstrukcji są szare, aby odróżnić je od
                    // swobodnych punktów geometrii, ale pozostają pełnoprawnymi
                    // argumentami kolejnych konstrukcji.
                    stroke: "#4b5563", fill: "#9ca3af", strokeWidth: style.strokeWidth,
                    strokeOpacity: style.strokeOpacity, fillOpacity: style.fillOpacity,
                    radius: style.radius, fontSize: style.fontSize, labelPosition: style.labelPosition,
                    showLabel: style.showLabel,
                };
            }
            if (objectType === "geometry.segment" || objectType === "graph.edge") {
                const result = {
                    stroke: style.stroke,
                    strokeWidth: style.strokeWidth,
                    lineDash: style.lineDash,
                    strokeOpacity: style.strokeOpacity,
                    labelPosition: style.labelPosition,
                    fontSize: style.fontSize,
                    showLabel: style.showLabel,
                };
                if (objectType === "graph.edge") {
                    result.directed = this.graphEdgeToolIsDirected(type);
                }
                return result;
            }
            if (objectType === "geometry.circle" || objectType === "geometry.polygon") {
                return {
                    stroke: style.stroke,
                    fill: "none",
                    strokeWidth: style.strokeWidth,
                    lineDash: style.lineDash,
                    strokeOpacity: style.strokeOpacity,
                    fillOpacity: style.fillOpacity,
                    labelPosition: style.labelPosition,
                    fontSize: style.fontSize,
                    showLabel: style.showLabel,
                };
            }
            return {
                fill: objectType === "graph.vertex" ? style.fill : style.stroke,
                stroke: style.stroke,
                strokeWidth: objectType === "graph.vertex" ? style.strokeWidth : Math.max(1, style.strokeWidth),
                strokeOpacity: style.strokeOpacity,
                fillOpacity: style.fillOpacity,
                fontSize: style.fontSize,
                labelPosition: style.labelPosition,
                radius: objectType === "graph.vertex" ? Math.max(style.radius, 8) : style.radius,
                showLabel: style.showLabel,
            };
        }

        saveDefaultStyleControls() {
            if (!window.localStorage) {
                return;
            }
            try {
                window.localStorage.setItem(this.defaultStyleStorageKey, JSON.stringify(this.defaultStyleFromControls()));
            } catch (error) {
                // localStorage can be unavailable in private mode; the editor still works.
            }
        }

        loadDefaultStyleControls() {
            if (!window.localStorage) {
                return;
            }
            try {
                const raw = window.localStorage.getItem(this.defaultStyleStorageKey);
                if (!raw) {
                    return;
                }
                const style = JSON.parse(raw);
                if (this.defaultStrokeInput) this.defaultStrokeInput.value = normalizeColor(style.stroke, "#111827");
                if (this.defaultFillInput) this.defaultFillInput.value = normalizeColor(style.fill, "#ffffff");
                if (this.defaultStrokeWidthInput) this.defaultStrokeWidthInput.value = String(Number.isFinite(Number(style.strokeWidth)) ? style.strokeWidth : 2);
                if (this.defaultLineDashInput) this.defaultLineDashInput.value = style.lineDash || "solid";
                if (this.defaultStrokeOpacityInput) this.defaultStrokeOpacityInput.value = String(opacityValue(style.strokeOpacity, 1));
                if (this.defaultFillOpacityInput) this.defaultFillOpacityInput.value = String(opacityValue(style.fillOpacity, 1));
                if (this.defaultFontSizeInput) this.defaultFontSizeInput.value = String(Number.isFinite(Number(style.fontSize)) ? style.fontSize : 14);
                if (this.defaultLabelPositionInput) this.defaultLabelPositionInput.value = style.labelPosition || "above-right";
                if (this.defaultRadiusInput) this.defaultRadiusInput.value = String(Number.isFinite(Number(style.radius)) ? style.radius : 6);
                if (this.defaultShowLabelInput) this.defaultShowLabelInput.checked = style.showLabel !== false;
            } catch (error) {
                // Ignore invalid saved settings.
            }
        }

        bindDefaultStyleEvents() {
            const controls = [
                this.defaultStrokeInput,
                this.defaultFillInput,
                this.defaultStrokeWidthInput,
                this.defaultLineDashInput,
                this.defaultStrokeOpacityInput,
                this.defaultFillOpacityInput,
                this.defaultFontSizeInput,
                this.defaultLabelPositionInput,
                this.defaultRadiusInput,
                this.defaultShowLabelInput,
            ].filter(Boolean);

            controls.forEach((control) => {
                control.addEventListener("change", () => {
                    this.saveDefaultStyleControls();
                    this.setStatus("Zmieniono domyślny styl nowych obiektów. Będzie używany aż do następnej zmiany.");
                });
            });
        }

        settingsFromDataset() {
            return {
                canvas: {
                    width: this.readInteger(this.root.dataset.canvasWidth, 900, 300, 3000),
                    height: this.readInteger(this.root.dataset.canvasHeight, 520, 200, 2000),
                    gridSize: this.readInteger(this.root.dataset.gridSize, 50, 5, 300),
                    showGrid: this.root.dataset.showGrid !== "false",
                    snapToGrid: this.root.dataset.snapToGrid === "true",
                },
                tikz: {
                    scale: this.readInteger(this.root.dataset.tikzScale, 100, 1, 1000),
                },
            };
        }

        readInteger(value, fallback, min, max) {
            const number = Number.parseInt(value, 10);
            if (!Number.isFinite(number)) {
                return fallback;
            }
            return Math.max(min, Math.min(max, number));
        }

        settingsFromControls() {
            return {
                canvas: {
                    width: this.readInteger(this.settingsWidthInput && this.settingsWidthInput.value, 900, 300, 3000),
                    height: this.readInteger(this.settingsHeightInput && this.settingsHeightInput.value, 520, 200, 2000),
                    gridSize: this.readInteger(this.settingsGridSizeInput && this.settingsGridSizeInput.value, 50, 5, 300),
                    showGrid: this.settingsShowGridInput ? this.settingsShowGridInput.checked : true,
                    snapToGrid: this.settingsSnapToGridInput ? this.settingsSnapToGridInput.checked : false,
                },
                tikz: {
                    scale: this.readInteger(this.settingsTikzScaleInput && this.settingsTikzScaleInput.value, 100, 1, 1000),
                },
            };
        }

        loadSettingsControls() {
            const canvas = this.drawingSettings.canvas;
            const tikz = this.drawingSettings.tikz;
            if (this.settingsWidthInput) this.settingsWidthInput.value = String(canvas.width);
            if (this.settingsHeightInput) this.settingsHeightInput.value = String(canvas.height);
            if (this.settingsGridSizeInput) this.settingsGridSizeInput.value = String(canvas.gridSize);
            if (this.settingsTikzScaleInput) this.settingsTikzScaleInput.value = String(tikz.scale);
            if (this.settingsShowGridInput) this.settingsShowGridInput.checked = canvas.showGrid;
            if (this.settingsSnapToGridInput) this.settingsSnapToGridInput.checked = canvas.snapToGrid;
        }

        applySettingsToSvg() {
            const canvas = this.drawingSettings.canvas;
            this.svg.setAttribute("viewBox", `0 0 ${canvas.width} ${canvas.height}`);
            this.svg.style.height = canvas.height + "px";
        }

        snapPoint(point) {
            const canvas = this.drawingSettings.canvas;
            if (!canvas.snapToGrid) {
                return {x: point.x, y: point.y};
            }
            const gridSize = Number(canvas.gridSize) || 50;
            return {
                x: Math.round(point.x / gridSize) * gridSize,
                y: Math.round(point.y / gridSize) * gridSize,
            };
        }

        async applyDrawingSettings() {
            const nextSettings = this.settingsFromControls();
            try {
                const result = await this.request(this.settingsUrl, {
                    method: "PATCH",
                    headers: {"Content-Type": "application/json"},
                    body: JSON.stringify({settings: nextSettings}),
                });
                this.drawingSettings = result.settings;
                this.loadSettingsControls();
                this.applySettingsToSvg();
                this.render();
                this.setStatus("Zapisano ustawienia rysunku. Snap do siatki " + (this.drawingSettings.canvas.snapToGrid ? "jest włączony." : "jest wyłączony."));
            } catch (error) {
                this.setStatus("Nie udało się zapisać ustawień rysunku: " + error.message, true);
            }
        }

        renderGrid() {
            this.svg.querySelectorAll(".drawing-editor__grid-line, .drawing-editor__axis-line").forEach((element) => element.remove());
            const canvas = this.drawingSettings.canvas;
            if (!canvas.showGrid) {
                return;
            }
            const namespace = "http://www.w3.org/2000/svg";
            const gridSize = Number(canvas.gridSize) || 50;
            for (let x = 0; x <= canvas.width; x += gridSize) {
                const line = document.createElementNS(namespace, "line");
                line.setAttribute("class", "drawing-editor__grid-line");
                line.setAttribute("x1", x);
                line.setAttribute("y1", 0);
                line.setAttribute("x2", x);
                line.setAttribute("y2", canvas.height);
                this.svg.appendChild(line);
            }
            for (let y = 0; y <= canvas.height; y += gridSize) {
                const line = document.createElementNS(namespace, "line");
                line.setAttribute("class", "drawing-editor__grid-line");
                line.setAttribute("x1", 0);
                line.setAttribute("y1", y);
                line.setAttribute("x2", canvas.width);
                line.setAttribute("y2", y);
                this.svg.appendChild(line);
            }
        }

        setStatus(message, isError = false) {
            if (!this.status) {
                return;
            }
            this.status.textContent = message;
            this.status.classList.toggle("drawing-editor__status--error", isError);
        }

        async request(url, options = {}) {
            const headers = options.headers || {};
            if (this.csrfToken) {
                headers["X-CSRFToken"] = this.csrfToken;
            }
            headers["Accept"] = "application/json";

            const response = await fetch(url, {
                credentials: "same-origin",
                ...options,
                headers,
            });

            let payload = null;
            try {
                payload = await response.json();
            } catch (error) {
                throw new Error("Serwer nie zwrócił poprawnego JSON-a.");
            }

            if (!response.ok || payload.success === false) {
                const errorText = payload.errors ? JSON.stringify(payload.errors) : "Request failed.";
                throw new Error(errorText);
            }

            return payload;
        }

        objectDetailUrl(objectId) {
            return this.objectsUrl + encodeURIComponent(objectId) + "/";
        }

        findObject(objectId) {
            return this.flattenObjects().find((object) => object.object_id === objectId);
        }

        dependencyIds(object) {
            if (!object || !object.data) { return []; }
            if (Array.isArray(object.dependencies)) { return object.dependencies.slice(); }
            const fieldsByType = {
                "graph.edge": ["source", "target"],
                "geometry.segment": ["source", "target"],
                "geometry.midpoint": ["source", "target"],
                "geometry.line_intersection": ["a1", "a2", "b1", "b2"],
                "geometry.perpendicular_projection": ["point", "lineA", "lineB"],
                "geometry.segment_projection": ["point", "segmentA", "segmentB"],
                "geometry.circle_nearest_point": ["point", "center", "radiusPoint"],
                "geometry.line_circle_intersection": ["lineA", "lineB", "center", "radiusPoint"],
                "geometry.circle_circle_intersection": ["centerA", "radiusPointA", "centerB", "radiusPointB"],
                "geometry.circumcenter": ["pointA", "pointB", "pointC"],
                "geometry.orthocenter": ["pointA", "pointB", "pointC"],
                "geometry.nine_point_center": ["pointA", "pointB", "pointC"],
                "geometry.centroid": ["pointA", "pointB", "pointC"],
                "geometry.incenter": ["pointA", "pointB", "pointC"],
                "geometry.excenter": ["pointA", "pointB", "pointC"],
                "geometry.excircle_touchpoint": ["pointA", "pointB", "pointC"],
                "geometry.incircle_touchpoint": ["pointA", "pointB", "pointC"],
                "geometry.reflection_across_line": ["point", "lineA", "lineB"],
                "geometry.rotation_around_point": ["point", "center"],
                "geometry.central_reflection": ["point", "center"],
                "geometry.homothety": ["point", "center"],
                "geometry.translation_by_vector": ["point", "vectorStart", "vectorEnd"],
                "geometry.circle": ["center", "point"],
                "geometry.polygon": ["points"],
                "label.relative": ["baseObjectId"],
            };
            const definition = registeredObjectType(object);
            const dependencyFields = definition && Array.isArray(definition.dependencyFields)
                ? definition.dependencyFields
                : (fieldsByType[object.type] || []);
            const ids = [];
            for (const field of dependencyFields) {
                const raw = object.data[field];
                const values = Array.isArray(raw) ? raw : [raw];
                for (const value of values) {
                    if (typeof value === "string" && value && !ids.includes(value)) { ids.push(value); }
                }
            }
            return ids;
        }

        dependentObjects(objectId) {
            return this.flattenObjects().filter((object) => this.dependencyIds(object).includes(objectId));
        }

        dependencyClosureIds(rootIds) {
            const closure = new Set((rootIds || []).filter(Boolean));
            const queue = Array.from(closure);
            while (queue.length > 0) {
                const currentId = queue.shift();
                for (const dependent of this.dependentObjects(currentId)) {
                    if (!closure.has(dependent.object_id)) {
                        closure.add(dependent.object_id);
                        queue.push(dependent.object_id);
                    }
                }
            }
            return closure;
        }

        resolveObjectPosition(object, visited = new Set()) {
            if (!object || visited.has(object.object_id)) { return null; }
            const nextVisited = new Set(visited);
            nextVisited.add(object.object_id);
            if (isPointLike(object) || object.type === "text.latex") {
                const x = Number(object.data && object.data.x);
                const y = Number(object.data && object.data.y);
                return Number.isFinite(x) && Number.isFinite(y) ? {x, y, object} : null;
            }
            if (isMidpoint(object)) {
                const source = this.findObject(object.data && object.data.source);
                const target = this.findObject(object.data && object.data.target);
                const sourcePosition = this.resolveObjectPosition(source, nextVisited);
                const targetPosition = this.resolveObjectPosition(target, nextVisited);
                if (!sourcePosition || !targetPosition) { return null; }
                return {x: (sourcePosition.x + targetPosition.x) / 2, y: (sourcePosition.y + targetPosition.y) / 2, object};
            }
            const definition = registeredObjectType(object);
            if (definition && typeof definition.resolvePosition === "function") {
                const resolved = definition.resolvePosition({
                    object,
                    findObject: (objectId) => this.findObject(objectId),
                    resolvePosition: (dependency) => this.resolveObjectPosition(dependency, nextVisited),
                });
                if (!resolved) { return null; }
                const x = Number(resolved.x);
                const y = Number(resolved.y);
                return Number.isFinite(x) && Number.isFinite(y) ? {x, y, object} : null;
            }
            if (isRelativeLabel(object)) {
                const base = this.findObject(this.dependencyIds(object)[0]);
                const basePosition = this.resolveObjectPosition(base, nextVisited);
                if (!basePosition) { return null; }
                const x = basePosition.x + Number(object.data && object.data.dx || 0);
                const y = basePosition.y + Number(object.data && object.data.dy || 0);
                return Number.isFinite(x) && Number.isFinite(y) ? {x, y, base} : null;
            }
            return null;
        }

        relativeLabelPosition(object) {
            return isRelativeLabel(object) ? this.resolveObjectPosition(object) : null;
        }

        selectedIds() {
            return Array.from(this.selectedObjectIds);
        }

        isSelected(objectId) {
            return this.selectedObjectIds.has(objectId);
        }

        setSingleSelection(objectId) {
            this.selectedObjectIds = new Set(objectId ? [objectId] : []);
            this.selectedObjectId = objectId || null;
        }

        toggleSelection(objectId) {
            if (this.selectedObjectIds.has(objectId)) {
                this.selectedObjectIds.delete(objectId);
                if (this.selectedObjectId === objectId) {
                    this.selectedObjectId = this.selectedIds()[0] || null;
                }
            } else {
                this.selectedObjectIds.add(objectId);
                this.selectedObjectId = objectId;
            }
        }

        selectedObjects() {
            return this.selectedIds()
                .map((objectId) => this.findObject(objectId))
                .filter(Boolean);
        }

        positionedSelectedObjects() {
            return this.expandGroups(this.selectedObjects(), false).filter(isPositionedObject);
        }

        selectionTargets(preferredObjectId = null) {
            const selected = this.selectedObjects();
            if (preferredObjectId && !this.isSelected(preferredObjectId)) {
                const preferred = this.findObject(preferredObjectId);
                return preferred ? this.expandGroups([preferred], true) : [];
            }
            return this.expandGroups(selected, true);
        }

        async applyToSelection(operation, {
            objects = null,
            emptyMessage = "Najpierw zaznacz co najmniej jeden obiekt.",
            successMessage = null,
            errorMessage = "Nie udało się zastosować operacji do zaznaczenia",
            render = true,
        } = {}) {
            const targets = Array.isArray(objects) ? objects.filter(Boolean) : this.selectedObjects();
            if (targets.length === 0) {
                this.setStatus(emptyMessage, true);
                return {updated: [], skipped: []};
            }

            const beforeObjects = [];
            const afterObjects = [];
            const skipped = [];

            try {
                for (const object of targets) {
                    const before = this.cloneObject(object);
                    const outcome = await operation(object, before);
                    if (!outcome || outcome.skip === true) {
                        skipped.push(object);
                        continue;
                    }
                    const after = outcome.object || outcome.after || outcome;
                    if (!after || !after.object_id) {
                        skipped.push(object);
                        continue;
                    }
                    this.replaceObjectInMemory(after);
                    beforeObjects.push(before);
                    afterObjects.push(this.cloneObject(after));
                }

                if (beforeObjects.length === 1) {
                    this.pushHistory({kind: "update", before: beforeObjects[0], after: afterObjects[0]});
                } else if (beforeObjects.length > 1) {
                    this.pushHistory({kind: "bulk-update", before: beforeObjects, after: afterObjects});
                }

                if (render) {
                    this.render();
                }
                if (typeof successMessage === "function") {
                    this.setStatus(successMessage(afterObjects, skipped));
                } else if (successMessage) {
                    this.setStatus(successMessage);
                }
                return {updated: afterObjects, skipped};
            } catch (error) {
                for (const before of beforeObjects) {
                    this.replaceObjectInMemory(before);
                }
                if (render) {
                    this.render();
                }
                this.setStatus(errorMessage + ": " + error.message, true);
                return {updated: [], skipped, error};
            }
        }

        findPoint(objectId) {
            const object = this.findObject(objectId);
            if (!object) { return null; }
            if (isPointLike(object)) { return object; }
            if (isDerivedPoint(object)) {
                const position = this.resolveObjectPosition(object);
                if (!position) { return null; }
                return {
                    ...object,
                    data: {...(object.data || {}), x: position.x, y: position.y},
                };
            }
            return null;
        }

        pointIsAllowedForCurrentTool(object) {
            const tool = this.currentToolType();
            if (this.isGraphEdgeTool(tool)) {
                return isGraphVertex(object);
            }
            if (tool === "geometry.segment" || tool === "geometry.midpoint" || tool === "geometry.line_intersection" || tool === "geometry.perpendicular_projection" || tool === "geometry.segment_projection" || tool === "geometry.circle_nearest_point" || tool === "geometry.line_circle_intersection" || tool === "geometry.circle_circle_intersection" || tool === "geometry.circumcenter" || tool === "geometry.orthocenter" || tool === "geometry.nine_point_center" || tool === "geometry.centroid" || tool === "geometry.incenter" || tool === "geometry.excenter" || tool === "geometry.excircle_touchpoint" || tool === "geometry.incircle_touchpoint" || tool === "geometry.reflection_across_line" || tool === "geometry.rotation_around_point" || tool === "geometry.central_reflection" || tool === "geometry.homothety" || tool === "geometry.translation_by_vector" || tool === "geometry.circle" || tool === "geometry.polygon") {
                return isGeometryPoint(object);
            }
            return isPointLike(object);
        }

        currentToolPointErrorMessage() {
            const tool = this.currentToolType();
            if (this.isGraphEdgeTool(tool)) {
                return "Krawędź grafowa może łączyć tylko obiekty graph.vertex.";
            }
            if (tool === "geometry.segment" || tool === "geometry.midpoint" || tool === "geometry.line_intersection" || tool === "geometry.perpendicular_projection" || tool === "geometry.segment_projection" || tool === "geometry.circle_nearest_point" || tool === "geometry.line_circle_intersection" || tool === "geometry.circle_circle_intersection" || tool === "geometry.circumcenter" || tool === "geometry.orthocenter" || tool === "geometry.nine_point_center" || tool === "geometry.centroid" || tool === "geometry.incenter" || tool === "geometry.excenter" || tool === "geometry.excircle_touchpoint" || tool === "geometry.incircle_touchpoint" || tool === "geometry.reflection_across_line" || tool === "geometry.rotation_around_point" || tool === "geometry.central_reflection" || tool === "geometry.homothety" || tool === "geometry.translation_by_vector") {
                if (tool === "geometry.midpoint") { return "Środek odcinka można wyznaczyć tylko z dwóch obiektów geometry.point."; }
                if (tool === "geometry.line_intersection") { return "Punkt przecięcia można wyznaczyć tylko z czterech obiektów geometry.point."; }
                if (tool === "geometry.perpendicular_projection" || tool === "geometry.segment_projection") { return "Rzut wymaga trzech obiektów geometry.point."; }
                if (tool === "geometry.circle_nearest_point") { return "Konstrukcja okręgu wymaga trzech obiektów geometry.point."; }
                if (tool === "geometry.line_circle_intersection") { return "Przecięcie prostej i okręgu wymaga czterech obiektów geometry.point."; }
                if (tool === "geometry.circle_circle_intersection") { return "Przecięcie dwóch okręgów wymaga czterech obiektów geometry.point."; }
                if (tool === "geometry.circumcenter") { return "Środek okręgu opisanego wymaga trzech różnych obiektów geometry.point."; }
                if (tool === "geometry.orthocenter") { return "Ortocentrum wymaga trzech różnych obiektów geometry.point."; }
                if (tool === "geometry.nine_point_center") { return "Środek okręgu dziewięciu punktów wymaga trzech różnych obiektów geometry.point."; }
                if (tool === "geometry.centroid") { return "Środek ciężkości wymaga trzech różnych obiektów geometry.point."; }
                if (tool === "geometry.incenter") { return "Środek okręgu wpisanego wymaga trzech różnych obiektów geometry.point."; }
                if (tool === "geometry.excenter") { return "Środek okręgu dopisanego wymaga trzech różnych obiektów geometry.point."; }
                if (tool === "geometry.excircle_touchpoint") { return "Punkt styczności okręgu dopisanego wymaga trzech różnych obiektów geometry.point."; }
                if (tool === "geometry.incircle_touchpoint") { return "Punkt styczności wymaga trzech różnych obiektów geometry.point."; }
                if (tool === "geometry.reflection_across_line" || tool === "geometry.rotation_around_point" || tool === "geometry.central_reflection" || tool === "geometry.homothety" || tool === "geometry.translation_by_vector") { return "Odbicie względem prostej wymaga trzech obiektów geometry.point."; }
                return "Odcinek geometryczny może łączyć tylko obiekty geometry.point, nie graph.vertex.";
            }
            if (tool === "geometry.circle") {
                return "Okrąg może używać tylko punktów geometry.point. Wierzchołki grafu nie są punktami geometrii.";
            }
            if (tool === "geometry.polygon") {
                return "Wielokąt może używać tylko punktów geometry.point. Wierzchołki grafu służą tylko do grafów.";
            }
            return "Ten obiekt nie może być użyty w aktualnym narzędziu.";
        }

        async createGeometryPointAt(point, {label = "", select = true, pushHistory = true} = {}) {
            const snapped = this.snapPoint(point);
            const payload = {
                type: "geometry.point",
                data: {
                    x: Math.round(snapped.x),
                    y: Math.round(snapped.y),
                    label: label,
                },
                style: this.styleForNewObject("geometry.point"),
            };
            const result = await this.request(this.objectsUrl, {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify(payload),
            });
            this.objects.push(result.object);
            if (select) {
                this.setSingleSelection(result.object.object_id);
            }
            if (pushHistory) {
                this.pushHistory({kind: "create", object: result.object});
            }
            return result.object;
        }

        async loadObjects() {
            try {
                const payload = await this.request(this.objectsUrl);
                this.objects = payload.objects || [];
                const discardedHistoryEntries = this.reconcileHistoryWithObjects();
                this.render();
                const historyNotice = discardedHistoryEntries > 0
                    ? ` Pominięto ${discardedHistoryEntries} nieaktualnych wpisów historii.`
                    : "";
                this.setStatus(this.helpTextForCurrentTool() + historyNotice, discardedHistoryEntries > 0);
            } catch (error) {
                this.setStatus("Nie udało się wczytać obiektów: " + error.message, true);
            }
        }


        handleCanvasPointerDown(event) {
            if (closestDrawingObjectId(event.target)) {
                return;
            }
            if (!this.currentToolSelectsOnly()) {
                return;
            }

            event.preventDefault();
            const startPoint = svgPointFromEvent(this.svg, event);
            this.selectionBoxState = {
                pointerId: event.pointerId,
                startX: startPoint.x,
                startY: startPoint.y,
                currentX: startPoint.x,
                currentY: startPoint.y,
                moved: false,
                additive: event.shiftKey || event.ctrlKey || event.metaKey,
            };

            this.removeSelectionBoxElement();
            this.selectionBoxElement = document.createElementNS("http://www.w3.org/2000/svg", "rect");
            this.selectionBoxElement.setAttribute("class", "drawing-editor__selection-box");
            this.selectionBoxElement.setAttribute("x", String(startPoint.x));
            this.selectionBoxElement.setAttribute("y", String(startPoint.y));
            this.selectionBoxElement.setAttribute("width", "0");
            this.selectionBoxElement.setAttribute("height", "0");
            this.svg.appendChild(this.selectionBoxElement);

            if (this.svg.setPointerCapture) {
                try {
                    this.svg.setPointerCapture(event.pointerId);
                } catch (error) {
                    // Rectangle selection still works without pointer capture in most browsers.
                }
            }
        }

        removeSelectionBoxElement() {
            if (this.selectionBoxElement && this.selectionBoxElement.parentNode) {
                this.selectionBoxElement.parentNode.removeChild(this.selectionBoxElement);
            }
            this.selectionBoxElement = null;
        }

        updateSelectionBoxElement() {
            if (!this.selectionBoxState || !this.selectionBoxElement) {
                return;
            }
            const box = this.normalizedSelectionBox();
            this.selectionBoxElement.setAttribute("x", String(box.x));
            this.selectionBoxElement.setAttribute("y", String(box.y));
            this.selectionBoxElement.setAttribute("width", String(box.width));
            this.selectionBoxElement.setAttribute("height", String(box.height));
        }

        normalizedSelectionBox() {
            const state = this.selectionBoxState;
            const x1 = Math.min(state.startX, state.currentX);
            const y1 = Math.min(state.startY, state.currentY);
            const x2 = Math.max(state.startX, state.currentX);
            const y2 = Math.max(state.startY, state.currentY);
            return {x: x1, y: y1, width: x2 - x1, height: y2 - y1};
        }

        objectBounds(object) {
            if (!object || !object.data || !objectIsVisible(object)) {
                return null;
            }

            if (isPointLike(object)) {
                const x = Number(object.data.x);
                const y = Number(object.data.y);
                const r = pointRadius(object) + 4;
                if (!Number.isFinite(x) || !Number.isFinite(y)) {
                    return null;
                }
                return {x1: x - r, y1: y - r, x2: x + r, y2: y + r};
            }

            if (isRelativeLabel(object)) {
                const position = this.relativeLabelPosition(object);
                if (!position) { return null; }
                const text = String(object.data.text || "");
                const width = Math.max(24, text.length * 9);
                const height = 24;
                return {x1: position.x - width / 2, y1: position.y - height / 2, x2: position.x + width / 2, y2: position.y + height / 2};
            }

            if (isTextLike(object)) {
                const x = Number(object.data.x);
                const y = Number(object.data.y);
                const text = String(object.data.text || object.data.label || "");
                const width = Math.max(24, text.length * 9);
                const height = 24;
                if (!Number.isFinite(x) || !Number.isFinite(y)) {
                    return null;
                }
                return {x1: x - width / 2, y1: y - height / 2, x2: x + width / 2, y2: y + height / 2};
            }

            if (isLineLike(object)) {
                const source = this.findPoint(object.data.source);
                const target = this.findPoint(object.data.target);
                if (!source || !target) {
                    return null;
                }
                const x1 = Number(source.data.x);
                const y1 = Number(source.data.y);
                const x2 = Number(target.data.x);
                const y2 = Number(target.data.y);
                if (![x1, y1, x2, y2].every(Number.isFinite)) {
                    return null;
                }
                return {
                    x1: Math.min(x1, x2) - 6,
                    y1: Math.min(y1, y2) - 6,
                    x2: Math.max(x1, x2) + 6,
                    y2: Math.max(y1, y2) + 6,
                };
            }

            if (isCircleLike(object)) {
                const center = this.findPoint(object.data.center);
                const point = this.findPoint(object.data.point);
                if (!center || !point) {
                    return null;
                }
                const cx = Number(center.data.x);
                const cy = Number(center.data.y);
                const px = Number(point.data.x);
                const py = Number(point.data.y);
                if (![cx, cy, px, py].every(Number.isFinite)) {
                    return null;
                }
                const r = Math.hypot(px - cx, py - cy) + 6;
                return {x1: cx - r, y1: cy - r, x2: cx + r, y2: cy + r};
            }

            if (isPolygonLike(object)) {
                const points = (object.data.points || [])
                    .map((pointId) => this.findPoint(pointId))
                    .filter(Boolean);
                if (points.length === 0) {
                    return null;
                }
                const xs = points.map((point) => Number(point.data.x)).filter(Number.isFinite);
                const ys = points.map((point) => Number(point.data.y)).filter(Number.isFinite);
                if (xs.length === 0 || ys.length === 0) {
                    return null;
                }
                return {
                    x1: Math.min(...xs) - 6,
                    y1: Math.min(...ys) - 6,
                    x2: Math.max(...xs) + 6,
                    y2: Math.max(...ys) + 6,
                };
            }

            if (isPlotSeriesLike(object)) {
                return {x1: 40, y1: 30, x2: this.drawingSettings.canvas.width - 30, y2: this.drawingSettings.canvas.height - 40};
            }

            return null;
        }

        boundsIntersectSelectionBox(bounds, box) {
            const x1 = box.x;
            const y1 = box.y;
            const x2 = box.x + box.width;
            const y2 = box.y + box.height;
            return bounds.x1 <= x2 && bounds.x2 >= x1 && bounds.y1 <= y2 && bounds.y2 >= y1;
        }

        objectIdsInsideSelectionBox() {
            const box = this.normalizedSelectionBox();
            return this.flattenObjects()
                .filter((object) => {
                    const bounds = this.objectBounds(object);
                    return bounds && this.boundsIntersectSelectionBox(bounds, box);
                })
                .map((object) => object.object_id);
        }

        finishSelectionBox() {
            const state = this.selectionBoxState;
            if (!state) {
                return;
            }
            const selectedIds = state.moved ? this.objectIdsInsideSelectionBox() : [];
            this.selectionBoxState = null;
            this.removeSelectionBoxElement();
            this.ignoreNextCanvasClick = true;

            if (!state.moved) {
                if (!state.additive) {
                    this.setSingleSelection(null);
                    this.pendingLineStartId = null;
                }
                this.render();
                this.setStatus("Wyczyszczono zaznaczenie.");
                return;
            }

            if (state.additive) {
                for (const objectId of selectedIds) {
                    this.selectedObjectIds.add(objectId);
                    this.selectedObjectId = objectId;
                }
            } else {
                this.selectedObjectIds = new Set(selectedIds);
                this.selectedObjectId = selectedIds[selectedIds.length - 1] || null;
            }

            this.render();
            const count = this.selectedObjectIds.size;
            if (count > 0) {
                this.openEditPanel("object");
            }
            this.setStatus("Zaznaczono prostokątem " + count + " obiekt" + (count === 1 ? "." : "ów."));
        }

        optionalPlotNumber(input) {
            if (!input) {
                return null;
            }
            const raw = String(input.value || "").trim();
            if (!raw) {
                return null;
            }
            const value = Number(raw);
            if (!Number.isFinite(value)) {
                throw new Error("Zakres osi musi być liczbą albo pustym polem: " + raw);
            }
            return value;
        }

        plotAxisSettingsFromPanel() {
            const axis = {
                title: this.plotTitleInput ? this.plotTitleInput.value.trim() : "",
                xLabel: this.plotXLabelInput ? (this.plotXLabelInput.value.trim() || "x") : "x",
                yLabel: this.plotYLabelInput ? (this.plotYLabelInput.value.trim() || "y") : "y",
            };
            const xMin = this.optionalPlotNumber(this.plotXMinInput);
            const xMax = this.optionalPlotNumber(this.plotXMaxInput);
            const yMin = this.optionalPlotNumber(this.plotYMinInput);
            const yMax = this.optionalPlotNumber(this.plotYMaxInput);
            if (xMin !== null) { axis.xMin = xMin; }
            if (xMax !== null) { axis.xMax = xMax; }
            if (yMin !== null) { axis.yMin = yMin; }
            if (yMax !== null) { axis.yMax = yMax; }
            if (axis.xMin !== undefined && axis.xMax !== undefined && axis.xMin >= axis.xMax) {
                throw new Error("Zakres osi X jest niepoprawny: X min musi być mniejsze niż X max.");
            }
            if (axis.yMin !== undefined && axis.yMax !== undefined && axis.yMin >= axis.yMax) {
                throw new Error("Zakres osi Y jest niepoprawny: Y min musi być mniejsze niż Y max.");
            }
            return axis;
        }

        parsePlotPointLines(rawText, options = {}) {
            const allowEmpty = options.allowEmpty === true;
            const lines = String(rawText || "")
                .split(/\n|;/)
                .map((line) => line.trim())
                .filter(Boolean);
            const points = [];
            for (const line of lines) {
                if (line.startsWith("#")) { continue; }
                const cleaned = line.replace(/[()]/g, "").replace(/\s+/g, " ").trim();
                const partsWithErrors = cleaned.split(/\s*\+-\s*/);
                const pointParts = partsWithErrors[0].includes(",") ? partsWithErrors[0].split(",") : partsWithErrors[0].split(" ");
                if (pointParts.length !== 2) {
                    throw new Error("Niepoprawny punkt: " + line + ". Użyj formatu x,y albo x,y +- dx,dy.");
                }
                const x = Number(pointParts[0].trim());
                const y = Number(pointParts[1].trim());
                if (!Number.isFinite(x) || !Number.isFinite(y)) {
                    throw new Error("Współrzędne wykresu muszą być liczbami: " + line);
                }
                if (partsWithErrors.length > 1) {
                    const errorParts = partsWithErrors[1].includes(",") ? partsWithErrors[1].split(",") : partsWithErrors[1].split(" ");
                    if (errorParts.length !== 2) {
                        throw new Error("Niepoprawne niepewności pomiarowe: " + line + ". Użyj formatu x,y +- dx,dy.");
                    }
                    const xError = Number(errorParts[0].trim());
                    const yError = Number(errorParts[1].trim());
                    if (!Number.isFinite(xError) || !Number.isFinite(yError) || xError < 0 || yError < 0) {
                        throw new Error("Niepewności pomiarowe muszą być nieujemnymi liczbami: " + line);
                    }
                    points.push([x, y, xError, yError]);
                } else {
                    points.push([x, y]);
                }
            }
            if (points.length === 0 && !allowEmpty) {
                throw new Error("Wpisz co najmniej jeden punkt wykresu.");
            }
            return points;
        }

        parsePlotHeader(line, fallback = {}) {
            const settings = {...fallback};
            const raw = String(line || "").replace(/^#/, "").trim();
            if (!raw) { return settings; }
            for (const part of raw.split(";")) {
                const [key, ...rest] = part.split("=");
                if (!key || rest.length === 0) { continue; }
                const normalizedKey = key.trim().toLowerCase();
                const value = rest.join("=").trim();
                if (normalizedKey === "label") { settings.label = value; }
                if (normalizedKey === "color") { settings.color = value; }
                if (normalizedKey === "type") { settings.plotType = value; }
            }
            return settings;
        }

        parsePlotSeriesBlocks(rawText, options = {}) {
            const allowEmpty = options.allowEmpty === true;
            const defaultType = this.plotTypeSelect ? this.plotTypeSelect.value : "line";
            const blocks = String(rawText || "").split(/\n\s*\n/).map((block) => block.trim()).filter(Boolean);
            const series = [];
            for (const block of blocks) {
                const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
                let settings = {label: series.length === 0 && this.labelInput ? this.labelInput.value.trim() : `Seria ${series.length + 1}`, plotType: defaultType};
                if (lines[0] && lines[0].startsWith("#")) {
                    settings = this.parsePlotHeader(lines.shift(), settings);
                }
                const points = this.parsePlotPointLines(lines.join("\n"), {allowEmpty: false});
                const style = {};
                if (settings.color && /^#[0-9a-fA-F]{6}$/.test(settings.color)) {
                    style.stroke = settings.color;
                    style.fill = settings.color;
                }
                series.push({
                    label: settings.label || `Seria ${series.length + 1}`,
                    plotType: ["line", "scatter", "line_markers"].includes(settings.plotType) ? settings.plotType : defaultType,
                    points,
                    style,
                });
            }
            if (series.length === 0 && !allowEmpty) {
                throw new Error("Wpisz co najmniej jedną serię danych albo funkcję.");
            }
            return series;
        }

        plotDataTextFromSeries(seriesList) {
            return (seriesList || []).map((series, index) => {
                const style = series.style || {};
                const header = `# label=${series.label || `Seria ${index + 1}`}; color=${style.stroke || "#2563eb"}; type=${series.plotType || "line"}`;
                const points = (series.points || []).map((pair) => String(pair[0]) + "," + String(pair[1])).join("\n");
                return header + "\n" + points;
            }).join("\n\n");
        }

        parsePlotFunctions(rawText) {
            const lines = String(rawText || "").split("\n").map((line) => line.trim()).filter(Boolean);
            const functions = [];
            for (const line of lines) {
                const parts = line.split(";").map((part) => part.trim());
                const expression = parts[0];
                if (!expression) { continue; }
                const domainMin = parts[1] !== undefined && parts[1] !== "" ? Number(parts[1]) : -5;
                const domainMax = parts[2] !== undefined && parts[2] !== "" ? Number(parts[2]) : 5;
                if (!Number.isFinite(domainMin) || !Number.isFinite(domainMax) || domainMin >= domainMax) {
                    throw new Error("Niepoprawna dziedzina funkcji: " + line);
                }
                const samples = parts[5] !== undefined && parts[5] !== "" ? Number(parts[5]) : 100;
                functions.push({
                    expression,
                    domainMin,
                    domainMax,
                    label: parts[3] || expression,
                    color: parts[4] || "#dc2626",
                    samples: Number.isInteger(samples) && samples >= 2 ? samples : 100,
                });
            }
            return functions;
        }

        plotFunctionTextFromFunctions(functions) {
            return (functions || []).map((fn) => [
                fn.expression || "",
                fn.domainMin !== undefined ? fn.domainMin : -5,
                fn.domainMax !== undefined ? fn.domainMax : 5,
                fn.label || fn.expression || "",
                fn.color || "#dc2626",
                fn.samples !== undefined ? fn.samples : 100,
            ].join("; ")).join("\n");
        }

        plotSeriesObjects() {
            return this.sortedObjects().filter((object) => isPlotSeriesLike(object));
        }

        plotColorFromStyle(style, fallback) {
            return (style && /^#[0-9a-fA-F]{6}$/.test(style.stroke || "")) ? style.stroke : fallback;
        }

        normalizePlotSeriesDraft(series, index = 0) {
            const style = series.style || {};
            const color = this.plotColorFromStyle(style, "#2563eb");
            return {
                label: series.label || `Seria ${index + 1}`,
                plotType: ["line", "scatter", "line_markers"].includes(series.plotType) ? series.plotType : "line",
                points: Array.isArray(series.points) ? series.points : [],
                style: {...style, stroke: color, fill: color},
            };
        }

        normalizePlotFunctionDraft(fn, index = 0) {
            const color = fn.color || (fn.style && fn.style.stroke) || "#16a34a";
            return {
                expression: fn.expression || "",
                domainMin: fn.domainMin !== undefined ? fn.domainMin : -5,
                domainMax: fn.domainMax !== undefined ? fn.domainMax : 5,
                label: fn.label || fn.expression || `Funkcja ${index + 1}`,
                color: /^#[0-9a-fA-F]{6}$/.test(color) ? color : "#16a34a",
                samples: Number.isInteger(Number(fn.samples)) && Number(fn.samples) >= 2 ? Number(fn.samples) : 100,
            };
        }

        setPlotDraftsFromData(data = {}) {
            this.plotSeriesDrafts = (Array.isArray(data.series) ? data.series : []).map((series, index) => this.normalizePlotSeriesDraft(series, index));
            this.plotFunctionDrafts = (Array.isArray(data.functions) ? data.functions : []).map((fn, index) => this.normalizePlotFunctionDraft(fn, index));
            if (this.plotDataInput) {
                this.plotDataInput.value = this.plotDataTextFromSeries(this.plotSeriesDrafts);
            }
            if (this.plotFunctionsInput) {
                this.plotFunctionsInput.value = this.plotFunctionTextFromFunctions(this.plotFunctionDrafts);
            }
            this.renderPlotDraftLists();
        }

        renderPlotDraftLists() {
            if (this.plotSeriesList) {
                this.plotSeriesList.innerHTML = "";
                if (!this.plotSeriesDrafts.length) {
                    const empty = document.createElement("p");
                    empty.className = "drawing-editor__empty-list";
                    empty.textContent = "Brak serii danych.";
                    this.plotSeriesList.appendChild(empty);
                }
                this.plotSeriesDrafts.forEach((series, index) => {
                    const row = document.createElement("div");
                    row.className = "drawing-editor__plot-list-row";
                    row.innerHTML = `
                        <span class="drawing-editor__plot-color" style="background:${series.style && series.style.stroke ? series.style.stroke : "#2563eb"}"></span>
                        <div class="drawing-editor__plot-list-text"><strong>${this.escapeHtml(series.label || `Seria ${index + 1}`)}</strong><small>${(series.points || []).length} pkt · ${this.escapeHtml(series.plotType || "line")}</small></div>
                        <button type="button" class="btn btn-secondary btn-small" data-action="edit-plot-series" data-index="${index}">Edytuj</button>
                        <button type="button" class="btn btn-danger btn-small" data-action="delete-plot-series" data-index="${index}">Usuń serię</button>
                    `;
                    this.plotSeriesList.appendChild(row);
                });
                this.plotSeriesList.querySelectorAll("[data-action='edit-plot-series']").forEach((button) => {
                    button.addEventListener("click", () => this.editPlotSeriesDraft(Number(button.dataset.index)));
                });
                this.plotSeriesList.querySelectorAll("[data-action='delete-plot-series']").forEach((button) => {
                    button.addEventListener("click", () => this.deletePlotSeriesDraft(Number(button.dataset.index)));
                });
            }
            if (this.plotFunctionsList) {
                this.plotFunctionsList.innerHTML = "";
                if (!this.plotFunctionDrafts.length) {
                    const empty = document.createElement("p");
                    empty.className = "drawing-editor__empty-list";
                    empty.textContent = "Brak funkcji.";
                    this.plotFunctionsList.appendChild(empty);
                }
                this.plotFunctionDrafts.forEach((fn, index) => {
                    const row = document.createElement("div");
                    row.className = "drawing-editor__plot-list-row";
                    row.innerHTML = `
                        <span class="drawing-editor__plot-color" style="background:${fn.color || "#16a34a"}"></span>
                        <div class="drawing-editor__plot-list-text"><strong>${this.escapeHtml(fn.label || fn.expression || `Funkcja ${index + 1}`)}</strong><small>${this.escapeHtml(fn.expression || "")} · [${fn.domainMin}, ${fn.domainMax}]</small></div>
                        <button type="button" class="btn btn-secondary btn-small" data-action="edit-plot-function" data-index="${index}">Edytuj</button>
                        <button type="button" class="btn btn-danger btn-small" data-action="delete-plot-function" data-index="${index}">Usuń funkcję</button>
                    `;
                    this.plotFunctionsList.appendChild(row);
                });
                this.plotFunctionsList.querySelectorAll("[data-action='edit-plot-function']").forEach((button) => {
                    button.addEventListener("click", () => this.editPlotFunctionDraft(Number(button.dataset.index)));
                });
                this.plotFunctionsList.querySelectorAll("[data-action='delete-plot-function']").forEach((button) => {
                    button.addEventListener("click", () => this.deletePlotFunctionDraft(Number(button.dataset.index)));
                });
            }
        }

        escapeHtml(value) {
            return String(value === undefined || value === null ? "" : value)
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;");
        }

        pointsTextFromPairs(points) {
            return (points || []).map((pair) => `${pair[0]},${pair[1]}`).join("\n");
        }

        clearPlotSeriesForm() {
            if (this.plotSeriesEditIndexInput) { this.plotSeriesEditIndexInput.value = ""; }
            if (this.plotSeriesLabelInput) { this.plotSeriesLabelInput.value = ""; }
            if (this.plotSeriesColorInput) { this.plotSeriesColorInput.value = "#2563eb"; }
            if (this.plotSeriesTypeSelect) { this.plotSeriesTypeSelect.value = "line"; }
            if (this.plotSeriesPointsInput) { this.plotSeriesPointsInput.value = ""; }
            const button = this.root.querySelector("[data-action='save-plot-series']");
            if (button) { button.textContent = "Dodaj serię"; }
        }

        editPlotSeriesDraft(index) {
            const series = this.plotSeriesDrafts[index];
            if (!series) { return; }
            if (this.plotSeriesEditIndexInput) { this.plotSeriesEditIndexInput.value = String(index); }
            if (this.plotSeriesLabelInput) { this.plotSeriesLabelInput.value = series.label || `Seria ${index + 1}`; }
            if (this.plotSeriesColorInput) { this.plotSeriesColorInput.value = this.plotColorFromStyle(series.style || {}, "#2563eb"); }
            if (this.plotSeriesTypeSelect) { this.plotSeriesTypeSelect.value = series.plotType || "line"; }
            if (this.plotSeriesPointsInput) { this.plotSeriesPointsInput.value = this.pointsTextFromPairs(series.points || []); }
            const button = this.root.querySelector("[data-action='save-plot-series']");
            if (button) { button.textContent = "Zapisz serię"; }
        }

        deletePlotSeriesDraft(index) {
            if (index < 0 || index >= this.plotSeriesDrafts.length) { return; }
            this.plotSeriesDrafts.splice(index, 1);
            this.clearPlotSeriesForm();
            this.syncHiddenPlotTextareas();
            this.renderPlotDraftLists();
        }

        savePlotSeriesDraftFromForm() {
            try {
                const points = this.parsePlotPointLines(this.plotSeriesPointsInput ? this.plotSeriesPointsInput.value : "", {allowEmpty: false});
                const label = this.plotSeriesLabelInput && this.plotSeriesLabelInput.value.trim() ? this.plotSeriesLabelInput.value.trim() : `Seria ${this.plotSeriesDrafts.length + 1}`;
                const color = this.plotSeriesColorInput && /^#[0-9a-fA-F]{6}$/.test(this.plotSeriesColorInput.value) ? this.plotSeriesColorInput.value : "#2563eb";
                const plotType = this.plotSeriesTypeSelect ? this.plotSeriesTypeSelect.value : "line";
                const draft = {label, plotType, points, style: {stroke: color, fill: color}};
                const editIndex = this.plotSeriesEditIndexInput && this.plotSeriesEditIndexInput.value !== "" ? Number(this.plotSeriesEditIndexInput.value) : null;
                if (editIndex !== null && Number.isInteger(editIndex) && editIndex >= 0 && editIndex < this.plotSeriesDrafts.length) {
                    this.plotSeriesDrafts[editIndex] = draft;
                } else {
                    this.plotSeriesDrafts.push(draft);
                }
                this.clearPlotSeriesForm();
                this.syncHiddenPlotTextareas();
                this.renderPlotDraftLists();
                this.setStatus("Zaktualizowano listę serii. Kliknij „Zastosuj wykres”, aby zapisać zmiany w rysunku.");
            } catch (error) {
                this.setStatus(error.message, true);
            }
        }

        clearPlotFunctionForm() {
            if (this.plotFunctionEditIndexInput) { this.plotFunctionEditIndexInput.value = ""; }
            if (this.plotFunctionExpressionInput) { this.plotFunctionExpressionInput.value = ""; }
            if (this.plotFunctionLabelInput) { this.plotFunctionLabelInput.value = ""; }
            if (this.plotFunctionColorInput) { this.plotFunctionColorInput.value = "#16a34a"; }
            if (this.plotFunctionMinInput) { this.plotFunctionMinInput.value = "-5"; }
            if (this.plotFunctionMaxInput) { this.plotFunctionMaxInput.value = "5"; }
            if (this.plotFunctionSamplesInput) { this.plotFunctionSamplesInput.value = "100"; }
            const button = this.root.querySelector("[data-action='save-plot-function']");
            if (button) { button.textContent = "Dodaj funkcję"; }
        }

        editPlotFunctionDraft(index) {
            const fn = this.plotFunctionDrafts[index];
            if (!fn) { return; }
            if (this.plotFunctionEditIndexInput) { this.plotFunctionEditIndexInput.value = String(index); }
            if (this.plotFunctionExpressionInput) { this.plotFunctionExpressionInput.value = fn.expression || ""; }
            if (this.plotFunctionLabelInput) { this.plotFunctionLabelInput.value = fn.label || fn.expression || ""; }
            if (this.plotFunctionColorInput) { this.plotFunctionColorInput.value = fn.color || "#16a34a"; }
            if (this.plotFunctionMinInput) { this.plotFunctionMinInput.value = fn.domainMin !== undefined ? fn.domainMin : -5; }
            if (this.plotFunctionMaxInput) { this.plotFunctionMaxInput.value = fn.domainMax !== undefined ? fn.domainMax : 5; }
            if (this.plotFunctionSamplesInput) { this.plotFunctionSamplesInput.value = fn.samples !== undefined ? fn.samples : 100; }
            const button = this.root.querySelector("[data-action='save-plot-function']");
            if (button) { button.textContent = "Zapisz funkcję"; }
        }

        deletePlotFunctionDraft(index) {
            if (index < 0 || index >= this.plotFunctionDrafts.length) { return; }
            this.plotFunctionDrafts.splice(index, 1);
            this.clearPlotFunctionForm();
            this.syncHiddenPlotTextareas();
            this.renderPlotDraftLists();
        }

        savePlotFunctionDraftFromForm() {
            try {
                const expression = this.plotFunctionExpressionInput ? this.plotFunctionExpressionInput.value.trim() : "";
                if (!expression) { throw new Error("Wpisz wzór funkcji."); }
                const domainMin = this.plotFunctionMinInput ? Number(this.plotFunctionMinInput.value) : -5;
                const domainMax = this.plotFunctionMaxInput ? Number(this.plotFunctionMaxInput.value) : 5;
                if (!Number.isFinite(domainMin) || !Number.isFinite(domainMax) || domainMin >= domainMax) {
                    throw new Error("Dziedzina funkcji jest niepoprawna: X min musi być mniejsze niż X max.");
                }
                const label = this.plotFunctionLabelInput && this.plotFunctionLabelInput.value.trim() ? this.plotFunctionLabelInput.value.trim() : expression;
                const color = this.plotFunctionColorInput && /^#[0-9a-fA-F]{6}$/.test(this.plotFunctionColorInput.value) ? this.plotFunctionColorInput.value : "#16a34a";
                const samples = this.plotFunctionSamplesInput ? Number(this.plotFunctionSamplesInput.value) : 100;
                if (!Number.isInteger(samples) || samples < 2) {
                    throw new Error("Liczba próbek funkcji musi być liczbą całkowitą większą lub równą 2.");
                }
                const draft = {expression, domainMin, domainMax, label, color, samples};
                const editIndex = this.plotFunctionEditIndexInput && this.plotFunctionEditIndexInput.value !== "" ? Number(this.plotFunctionEditIndexInput.value) : null;
                if (editIndex !== null && Number.isInteger(editIndex) && editIndex >= 0 && editIndex < this.plotFunctionDrafts.length) {
                    this.plotFunctionDrafts[editIndex] = draft;
                } else {
                    this.plotFunctionDrafts.push(draft);
                }
                this.clearPlotFunctionForm();
                this.syncHiddenPlotTextareas();
                this.renderPlotDraftLists();
                this.setStatus("Zaktualizowano listę funkcji. Kliknij „Zastosuj wykres”, aby zapisać zmiany w rysunku.");
            } catch (error) {
                this.setStatus(error.message, true);
            }
        }

        syncHiddenPlotTextareas() {
            if (this.plotDataInput) { this.plotDataInput.value = this.plotDataTextFromSeries(this.plotSeriesDrafts); }
            if (this.plotFunctionsInput) { this.plotFunctionsInput.value = this.plotFunctionTextFromFunctions(this.plotFunctionDrafts); }
        }

        updatePlotPanelFromSelection() {
            if (!this.plotPanel) {
                return;
            }
            const selected = this.findObject(this.selectedObjectId);
            const target = selected && isPlotSeriesLike(selected) ? selected : this.plotSeriesObjects()[0];
            if (!target) {
                this.renderPlotDraftLists();
                return;
            }
            const data = target.data || {};
            const series = target.type === "plot.chart"
                ? (Array.isArray(data.series) ? data.series : [])
                : [{points: data.points || [], label: data.label || "Dane", plotType: data.plotType || "line", style: target.style || {}}];

            const serialized = JSON.stringify({series, functions: data.functions || []});
            if (this.lastLoadedPlotDraftKey !== serialized) {
                this.lastLoadedPlotDraftKey = serialized;
                this.setPlotDraftsFromData({series, functions: data.functions || []});
            } else {
                this.renderPlotDraftLists();
            }

            if (this.plotShowLegendInput) {
                const legend = data.legend || {};
                this.plotShowLegendInput.checked = legend.show !== false;
            }
            const axis = data.axis || {};
            if (this.plotTitleInput) { this.plotTitleInput.value = axis.title || ""; }
            if (this.plotXLabelInput) { this.plotXLabelInput.value = axis.xLabel || "x"; }
            if (this.plotYLabelInput) { this.plotYLabelInput.value = axis.yLabel || "y"; }
            if (this.plotXMinInput) { this.plotXMinInput.value = axis.xMin !== undefined && axis.xMin !== null ? axis.xMin : ""; }
            if (this.plotXMaxInput) { this.plotXMaxInput.value = axis.xMax !== undefined && axis.xMax !== null ? axis.xMax : ""; }
            if (this.plotYMinInput) { this.plotYMinInput.value = axis.yMin !== undefined && axis.yMin !== null ? axis.yMin : ""; }
            if (this.plotYMaxInput) { this.plotYMaxInput.value = axis.yMax !== undefined && axis.yMax !== null ? axis.yMax : ""; }
        }

        async deletePlotSeriesObjects(objectsToDelete) {
            for (const object of objectsToDelete) {
                await this.request(this.objectDetailUrl(object.object_id), {method: "DELETE"});
                this.removeObjectFromMemory(object.object_id);
            }
        }

        async addPlotSeriesFromPanel() {
            let series;
            let functions;
            let axis;
            try {
                this.syncHiddenPlotTextareas();
                // Legacy test marker: parsePlotData(this.plotDataInput ? this.plotDataInput.value : "", {allowEmpty: true})
                series = this.plotSeriesDrafts.map((item, index) => this.normalizePlotSeriesDraft(item, index));
                functions = this.plotFunctionDrafts.map((item, index) => this.normalizePlotFunctionDraft(item, index));
                axis = this.plotAxisSettingsFromPanel();
            } catch (error) {
                this.setStatus(error.message, true);
                return;
            }

            const existingCharts = this.plotSeriesObjects();

            if (series.length === 0 && functions.length === 0) {
                if (existingCharts.length === 0) {
                    this.setStatus("Pola wykresu są puste i nie ma wykresu do usunięcia.");
                    this.render();
                    return;
                }
                const deleted = existingCharts.map((object) => this.cloneObject(object));
                try {
                    await this.deletePlotSeriesObjects(existingCharts);
                    this.setSingleSelection(null);
                    this.pushHistory(deleted.length === 1 ? {kind: "delete", object: deleted[0]} : {kind: "bulk-delete", objects: deleted});
                    this.render();
                    this.setStatus("Pola wykresu są puste, więc usunięto wykres z rysunku.");
                } catch (error) {
                    this.setStatus("Nie udało się usunąć wykresu: " + error.message, true);
                }
                return;
            }

            const selected = this.findObject(this.selectedObjectId);
            const target = selected && isPlotSeriesLike(selected) ? selected : existingCharts[0];
            const newData = {
                series,
                functions,
                axis,
                legend: {show: this.plotShowLegendInput ? this.plotShowLegendInput.checked : true},
            };

            try {
                if (target) {
                    const before = this.cloneObject(target);
                    const extras = existingCharts.filter((object) => object.object_id !== target.object_id);
                    const result = await this.request(this.objectDetailUrl(target.object_id), {
                        method: "PATCH",
                        headers: {"Content-Type": "application/json"},
                        body: JSON.stringify({type: "plot.chart", data: newData, style: this.styleForNewObject("plot.chart")}),
                    });
                    this.replaceObjectInMemory(result.object);
                    this.lastLoadedPlotDraftKey = null;
                    if (extras.length > 0) {
                        await this.deletePlotSeriesObjects(extras);
                    }
                    this.setSingleSelection(result.object.object_id);
                    this.pushHistory({kind: "update", before: before, after: result.object});
                    this.render();
                    this.setStatus("Zaktualizowano wykres. Rysunek zawiera jeden obiekt plot.chart. Na rysunku są tylko punkty wpisane w polu danych oraz funkcje wpisane w panelu.");
                    return;
                }

                const payload = {
                    type: "plot.chart",
                    data: newData,
                    style: this.styleForNewObject("plot.chart"),
                };
                const result = await this.request(this.objectsUrl, {
                    method: "POST",
                    headers: {"Content-Type": "application/json"},
                    body: JSON.stringify(payload),
                });
                this.objects.push(result.object);
                this.lastLoadedPlotDraftKey = null;
                this.setSingleSelection(result.object.object_id);
                this.pushHistory({kind: "create", object: result.object});
                this.render();
                this.setStatus("Dodano wykres jako " + result.object.object_id + ".");
            } catch (error) {
                this.setStatus("Nie udało się zsynchronizować wykresu: " + error.message, true);
            }
        }

        async handleCanvasClick(event) {
            if (this.ignoreNextCanvasClick) {
                this.ignoreNextCanvasClick = false;
                return;
            }

            if (closestDrawingObjectId(event.target)) {
                return;
            }

            if (this.currentToolSelectsOnly()) {
                this.setSingleSelection(null);
                this.pendingLineStartId = null;
                this.render();
                this.setStatus("Wyczyszczono zaznaczenie.");
                return;
            }

            const point = this.snapPoint(svgPointFromEvent(this.svg, event));
            const selectedType = this.currentToolType();
            const label = this.labelInput ? this.labelInput.value.trim() : "";

            try {
                if (await this.runRegisteredCanvasHandler(selectedType, event, point)) {
                    this.render();
                    return;
                }
            } catch (error) {
                this.setStatus("Błąd narzędzia pluginu: " + error.message, true);
                return;
            }

            if (selectedType === "plot.series" || selectedType === "plot.chart") {
                this.setStatus("Wykres dodaj z panelu „Wykres” pod obszarem rysunku.");
                return;
            }

            if (this.currentToolCreatesCircle() || selectedType === "geometry.segment") {
                try {
                    const createdPoint = await this.createGeometryPointAt(point, {label: "", select: true, pushHistory: true});
                    if (!this.pendingLineStartId) {
                        this.pendingLineStartId = createdPoint.object_id;
                        this.render();
                        if (this.currentToolCreatesCircle()) {
                            this.setStatus("Utworzono środek okręgu. Kliknij drugi punkt, który wyznaczy promień.");
                        } else {
                            this.setStatus("Utworzono pierwszy koniec odcinka. Kliknij drugi punkt albo miejsce na canvasie.");
                        }
                        return;
                    }
                    await this.createLineBetweenPoints(this.pendingLineStartId, createdPoint.object_id);
                } catch (error) {
                    this.setStatus("Nie udało się utworzyć punktu obiektu geometrycznego: " + error.message, true);
                }
                return;
            }

            if (this.currentToolCreatesPolygon()) {
                try {
                    const createdPoint = await this.createGeometryPointAt(point, {label: "", select: true, pushHistory: true});
                    this.addPointToPendingPolygon(createdPoint.object_id);
                } catch (error) {
                    this.setStatus("Nie udało się dodać punktu wielokąta: " + error.message, true);
                }
                return;
            }

            if (this.currentToolCreatesLineIntersection() || this.currentToolCreatesPerpendicularProjection() || this.currentToolCreatesReflectionAcrossLine()) {
                this.setStatus("Ta komenda wymaga wskazania istniejących punktów geometrycznych.", true);
                return;
            }

            if (this.currentToolCreatesByTwoPoints()) {
                this.setStatus(this.currentToolCreatesMidpoint() ? "Komenda środka wymaga kliknięcia dwóch istniejących punktów geometrycznych." : "W tym trybie kliknij dwa istniejące wierzchołki graph.vertex.", true);
                return;
            }

            const payload = {
                type: selectedType,
                data: {
                    x: Math.round(point.x),
                    y: Math.round(point.y),
                    label: label,
                },
                style: this.styleForNewObject(selectedType),
            };

            if (selectedType === "text.latex") {
                payload.data.text = label || "x";
                payload.data.label = "";
                payload.style = this.styleForNewObject(selectedType);
            }

            try {
                const result = await this.request(this.objectsUrl, {
                    method: "POST",
                    headers: {"Content-Type": "application/json"},
                    body: JSON.stringify(payload),
                });
                this.objects.push(result.object);
                this.lastLoadedPlotDraftKey = null;
                this.setSingleSelection(result.object.object_id);
                this.pushHistory({kind: "create", object: result.object});
                this.render();
                this.setStatus("Dodano obiekt " + result.object.object_id + ".");
            } catch (error) {
                this.setStatus("Nie udało się dodać obiektu: " + error.message, true);
            }
        }

        updatePolygonButtons() {
            // Krok 19: wielokąt domykamy kliknięciem pierwszego punktu,
            // więc nie pokazujemy osobnych przycisków kończenia/anulowania.
            if (this.finishPolygonButton) {
                this.finishPolygonButton.hidden = true;
                this.finishPolygonButton.disabled = true;
            }
            if (this.cancelPolygonButton) {
                this.cancelPolygonButton.hidden = true;
                this.cancelPolygonButton.disabled = true;
            }
        }

        addPointToPendingPolygon(objectId) {
            if (!this.pendingPolygonPointIds) {
                this.pendingPolygonPointIds = [];
            }

            if (this.pendingPolygonPointIds.length >= 3 && objectId === this.pendingPolygonPointIds[0]) {
                this.finishPendingPolygon();
                return;
            }

            if (this.pendingPolygonPointIds.includes(objectId)) {
                this.setStatus("Ten punkt jest już w aktualnym wielokącie. Aby domknąć wielokąt, kliknij ponownie pierwszy punkt po wybraniu co najmniej 3 punktów.", true);
                return;
            }

            this.pendingPolygonPointIds.push(objectId);
            this.setSingleSelection(objectId);
            this.updatePolygonButtons();
            this.render();
            const count = this.pendingPolygonPointIds.length;
            this.setStatus("Dodano punkt " + objectId + " do wielokąta (" + count + "). " + (count >= 3 ? "Kliknij ponownie pierwszy punkt, żeby domknąć wielokąt." : "Wybierz jeszcze " + (3 - count) + " punkt" + (3 - count === 1 ? "." : "y.")));
        }

        cancelPendingPolygon() {
            this.pendingPolygonPointIds = [];
            this.updatePolygonButtons();
            this.render();
            this.setStatus("Anulowano tworzenie wielokąta.");
        }

        async finishPendingPolygon() {
            const points = this.pendingPolygonPointIds || [];
            if (points.length < 3) {
                this.setStatus("Wielokąt wymaga co najmniej trzech punktów.", true);
                return;
            }

            const label = this.labelInput ? this.labelInput.value.trim() : "";
            const payload = {
                type: "geometry.polygon",
                data: {
                    points: points.slice(),
                    closed: true,
                    label: label,
                },
                style: this.styleForNewObject("geometry.polygon"),
            };

            try {
                const result = await this.request(this.objectsUrl, {
                    method: "POST",
                    headers: {"Content-Type": "application/json"},
                    body: JSON.stringify(payload),
                });
                this.objects.push(result.object);
                this.pendingPolygonPointIds = [];
                this.setSingleSelection(result.object.object_id);
                this.updatePolygonButtons();
                this.pushHistory({kind: "create", object: result.object});
                this.switchToSelectAfterGeometryCreation("geometry.polygon");
                this.render();
                this.setStatus("Dodano wielokąt " + result.object.object_id + " z " + points.length + " punktów. Możesz teraz przesuwać jego punkty sterujące.");
            } catch (error) {
                this.setStatus("Nie udało się dodać wielokąta: " + error.message, true);
            }
        }

        async createRelativeLabel(baseObject, text) {
            const payload = {
                type: "label.relative",
                data: {baseObjectId: baseObject.object_id, text: text, dx: 18, dy: -18},
                style: this.styleForNewObject("label.relative"),
            };
            try {
                const result = await this.request(this.objectsUrl, {
                    method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(payload),
                });
                this.objects.push(result.object);
                this.setSingleSelection(result.object.object_id);
                this.pushHistory({kind: "create", object: result.object});
                this.currentToolSelectsOnly();
                this.render();
                this.setStatus("Dodano etykietę przypiętą do " + baseObject.object_id + ".");
            } catch (error) {
                this.setStatus("Nie udało się dodać etykiety względnej: " + error.message, true);
            }
        }

        async createLineIntersection(pointIds) {
            if (!Array.isArray(pointIds) || pointIds.length !== 4) {
                this.setStatus("Do wyznaczenia przecięcia potrzebne są cztery punkty.", true);
                return;
            }
            if (pointIds[0] === pointIds[1] || pointIds[2] === pointIds[3]) {
                this.setStatus("Każda prosta musi być wyznaczona przez dwa różne punkty.", true);
                return;
            }
            const positions = pointIds.map((id) => this.resolveObjectPosition(this.findObject(id)));
            if (positions.some((position) => !position)) {
                this.setStatus("Nie można odczytać pozycji wybranych punktów.", true);
                return;
            }
            const [p1, p2, p3, p4] = positions;
            const denominator = (p1.x - p2.x) * (p3.y - p4.y) - (p1.y - p2.y) * (p3.x - p4.x);
            if (Math.abs(denominator) < 1e-9) {
                this.pendingIntersectionPointIds = [];
                this.render();
                this.setStatus("Wybrane proste są równoległe lub pokrywają się — punkt przecięcia nie jest jednoznaczny.", true);
                return;
            }
            const label = this.labelInput ? this.labelInput.value.trim() : "";
            const payload = {
                type: "geometry.line_intersection",
                data: {command: "line_intersection", a1: pointIds[0], a2: pointIds[1], b1: pointIds[2], b2: pointIds[3], label},
                style: this.styleForNewObject("geometry.line_intersection"),
            };
            try {
                const result = await this.request(this.objectsUrl, {
                    method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(payload),
                });
                this.objects.push(result.object);
                this.pendingIntersectionPointIds = [];
                this.setSingleSelection(result.object.object_id);
                this.pushHistory({kind: "create", object: result.object});
                this.setToolType("select");
                this.render();
                this.setStatus("Dodano dynamiczny punkt przecięcia prostych.");
            } catch (error) {
                this.setStatus("Nie udało się dodać punktu przecięcia: " + error.message, true);
            }
        }

        async createPerpendicularProjection(pointIds) {
            if (!Array.isArray(pointIds) || pointIds.length !== 3) {
                this.setStatus("Do utworzenia rzutu potrzebne są trzy punkty.", true);
                return;
            }
            if (pointIds[1] === pointIds[2]) {
                this.pendingProjectionPointIds = [];
                this.render();
                this.setStatus("Prosta musi być wyznaczona przez dwa różne punkty.", true);
                return;
            }
            const label = this.labelInput ? this.labelInput.value.trim() : "";
            const payload = {
                type: "geometry.perpendicular_projection",
                data: {command: "perpendicular_projection", point: pointIds[0], lineA: pointIds[1], lineB: pointIds[2], label},
                style: this.styleForNewObject("geometry.perpendicular_projection"),
            };
            try {
                const result = await this.request(this.objectsUrl, {
                    method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(payload),
                });
                this.objects.push(result.object);
                this.pendingProjectionPointIds = [];
                this.setSingleSelection(result.object.object_id);
                this.pushHistory({kind: "create", object: result.object});
                this.setToolType("select");
                this.render();
                this.setStatus("Dodano dynamiczny rzut prostokątny punktu na prostą.");
            } catch (error) {
                this.setStatus("Nie udało się dodać rzutu prostokątnego: " + error.message, true);
            }
        }

        async createSegmentProjection(pointIds) {
            if (!Array.isArray(pointIds) || pointIds.length !== 3) { return; }
            if (new Set(pointIds).size !== 3) {
                this.pendingSegmentProjectionPointIds = [];
                this.render();
                this.setStatus("Punkt oraz oba końce odcinka muszą być różne.", true);
                return;
            }
            const label = this.labelInput ? this.labelInput.value.trim() : "";
            const payload = {
                type: "geometry.segment_projection",
                data: {command: "segment_projection", point: pointIds[0], segmentA: pointIds[1], segmentB: pointIds[2], label},
                style: this.styleForNewObject("geometry.segment_projection"),
            };
            try {
                const result = await this.request(this.objectsUrl, {
                    method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(payload),
                });
                this.objects.push(result.object);
                this.pendingSegmentProjectionPointIds = [];
                this.setSingleSelection(result.object.object_id);
                this.pushHistory({kind: "create", object: result.object});
                this.setToolType("select");
                this.render();
                this.setStatus("Dodano dynamiczny najbliższy punkt na odcinku.");
            } catch (error) {
                this.setStatus("Nie udało się dodać rzutu na odcinek: " + error.message, true);
            }
        }

        async createCircleNearestPoint(pointIds) {
            if (!Array.isArray(pointIds) || pointIds.length !== 3) { return; }
            if (new Set(pointIds).size !== 3) {
                this.pendingCircleNearestPointIds = [];
                this.render();
                this.setStatus("Punkt, środek i punkt promienia muszą być różne.", true);
                return;
            }
            const label = this.labelInput ? this.labelInput.value.trim() : "";
            const payload = {
                type: "geometry.circle_nearest_point",
                data: {command: "circle_nearest_point", point: pointIds[0], center: pointIds[1], radiusPoint: pointIds[2], label},
                style: this.styleForNewObject("geometry.circle_nearest_point"),
            };
            try {
                const result = await this.request(this.objectsUrl, {
                    method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(payload),
                });
                this.objects.push(result.object);
                this.pendingCircleNearestPointIds = [];
                this.setSingleSelection(result.object.object_id);
                this.pushHistory({kind: "create", object: result.object});
                this.setToolType("select");
                this.render();
                this.setStatus("Dodano dynamiczny najbliższy punkt na okręgu.");
            } catch (error) {
                this.setStatus("Nie udało się dodać punktu na okręgu: " + error.message, true);
            }
        }

        async createLineCircleIntersection(pointIds) {
            if (!Array.isArray(pointIds) || pointIds.length !== 4) { return; }
            if (new Set(pointIds).size !== 4) {
                this.pendingLineCircleIntersectionPointIds = [];
                this.render();
                this.setStatus("Cztery punkty konstrukcji muszą być różne.", true);
                return;
            }
            const positions = pointIds.map((id) => this.resolveObjectPosition(this.findObject(id)));
            if (positions.some((point) => !point)) {
                this.setStatus("Nie udało się odczytać pozycji punktów konstrukcji.", true);
                return;
            }
            const [a, b, center, radiusPoint] = positions;
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const qa = dx * dx + dy * dy;
            const radiusSq = (radiusPoint.x - center.x) ** 2 + (radiusPoint.y - center.y) ** 2;
            if (qa < 1e-12 || radiusSq < 1e-12) {
                this.setStatus("Prosta i okrąg muszą być wyznaczone przez różne punkty.", true);
                return;
            }
            const fx = a.x - center.x;
            const fy = a.y - center.y;
            const qb = 2 * (fx * dx + fy * dy);
            const qc = fx * fx + fy * fy - radiusSq;
            const discriminant = qb * qb - 4 * qa * qc;
            if (discriminant < -1e-9) {
                this.pendingLineCircleIntersectionPointIds = [];
                this.render();
                this.setStatus("Prosta nie przecina okręgu.", true);
                return;
            }
            const baseLabel = this.labelInput ? this.labelInput.value.trim() : "X";
            const branches = Math.abs(discriminant) <= 1e-9 ? [0] : [-1, 1];
            const payloads = branches.map((branch, index) => ({
                type: "geometry.line_circle_intersection",
                data: {
                    command: "line_circle_intersection",
                    lineA: pointIds[0], lineB: pointIds[1], center: pointIds[2], radiusPoint: pointIds[3],
                    branch,
                    label: branches.length === 1 ? baseLabel : baseLabel + (index + 1),
                },
                style: this.styleForNewObject("geometry.line_circle_intersection"),
            }));
            try {
                await this.createObjectsFromPlugin(payloads, {
                    selectCreated: true,
                    successMessage: branches.length === 1
                        ? "Dodano punkt styczności prostej i okręgu."
                        : "Dodano dwa dynamiczne punkty przecięcia prostej i okręgu.",
                });
                this.pendingLineCircleIntersectionPointIds = [];
                this.setToolType("select");
                this.render();
            } catch (error) {
                this.setStatus("Nie udało się dodać przecięcia prostej i okręgu: " + error.message, true);
            }
        }

        async createCircleCircleIntersection(pointIds) {
            if (!Array.isArray(pointIds) || pointIds.length !== 4) { return; }
            if (new Set(pointIds).size !== 4) {
                this.pendingCircleCircleIntersectionPointIds = [];
                this.render();
                this.setStatus("Cztery punkty konstrukcji muszą być różne.", true);
                return;
            }
            const positions = pointIds.map((id) => this.resolveObjectPosition(this.findObject(id)));
            if (positions.some((point) => !point)) {
                this.setStatus("Nie udało się odczytać pozycji punktów konstrukcji.", true);
                return;
            }
            const [ca, ra, cb, rb] = positions;
            const r0 = Math.hypot(ra.x-ca.x, ra.y-ca.y);
            const r1 = Math.hypot(rb.x-cb.x, rb.y-cb.y);
            const d = Math.hypot(cb.x-ca.x, cb.y-ca.y);
            const eps = 1e-9;
            if (r0 < eps || r1 < eps || d < eps) {
                this.setStatus("Okręgi muszą mieć dodatnie promienie i różne środki.", true);
                return;
            }
            if (d > r0+r1+eps || d < Math.abs(r0-r1)-eps) {
                this.pendingCircleCircleIntersectionPointIds = [];
                this.render();
                this.setStatus("Okręgi nie mają punktów wspólnych.", true);
                return;
            }
            if (d < eps && Math.abs(r0-r1) <= eps) {
                this.setStatus("Okręgi pokrywają się — przecięcie nie jest jednoznaczne.", true);
                return;
            }
            const a = (r0*r0-r1*r1+d*d)/(2*d);
            const h2 = r0*r0-a*a;
            const baseLabel = this.labelInput ? this.labelInput.value.trim() : "X";
            const branches = Math.abs(h2) <= eps ? [0] : [-1, 1];
            const payloads = branches.map((branch, index) => ({
                type: "geometry.circle_circle_intersection",
                data: {
                    command: "circle_circle_intersection",
                    centerA: pointIds[0], radiusPointA: pointIds[1], centerB: pointIds[2], radiusPointB: pointIds[3],
                    branch,
                    label: branches.length === 1 ? baseLabel : baseLabel + (index + 1),
                },
                style: this.styleForNewObject("geometry.circle_circle_intersection"),
            }));
            try {
                await this.createObjectsFromPlugin(payloads, {
                    selectCreated: true,
                    successMessage: branches.length === 1
                        ? "Dodano punkt styczności dwóch okręgów."
                        : "Dodano dwa dynamiczne punkty przecięcia okręgów.",
                });
                this.pendingCircleCircleIntersectionPointIds = [];
                this.setToolType("select");
                this.render();
            } catch (error) {
                this.setStatus("Nie udało się dodać przecięcia okręgów: " + error.message, true);
            }
        }

        async createCircumcenter(pointIds) {
            if (!Array.isArray(pointIds) || pointIds.length !== 3) { return; }
            if (new Set(pointIds).size !== 3) {
                this.pendingCircumcenterPointIds = []; this.render();
                this.setStatus("Do wyznaczenia okręgu opisanego potrzebne są trzy różne punkty.", true); return;
            }
            const positions = pointIds.map((id) => this.resolveObjectPosition(this.findObject(id)));
            if (positions.some((point) => !point)) { this.setStatus("Nie udało się odczytać pozycji punktów trójkąta.", true); return; }
            const [a,b,c] = positions;
            const denominator = 2 * (a.x*(b.y-c.y)+b.x*(c.y-a.y)+c.x*(a.y-b.y));
            if (Math.abs(denominator) < 1e-9) {
                this.pendingCircumcenterPointIds=[]; this.render();
                this.setStatus("Wybrane punkty są współliniowe — okrąg opisany nie jest jednoznaczny.", true); return;
            }
            const label = this.labelInput ? this.labelInput.value.trim() : "O";
            try {
                const centerResult = await this.request(this.objectsUrl, {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({
                    type:"geometry.circumcenter", data:{command:"circumcenter", pointA:pointIds[0], pointB:pointIds[1], pointC:pointIds[2], label}, style:this.styleForNewObject("geometry.circumcenter")
                })});
                this.objects.push(centerResult.object);
                const circleResult = await this.request(this.objectsUrl, {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({
                    type:"geometry.circle", data:{center:centerResult.object.object_id, point:pointIds[0], label:""}, style:this.styleForNewObject("geometry.circle")
                })});
                this.objects.push(circleResult.object);
                this.pendingCircumcenterPointIds=[]; this.setSingleSelection(centerResult.object.object_id);
                this.pushHistory({kind:"create", object:centerResult.object}); this.pushHistory({kind:"create", object:circleResult.object});
                this.setToolType("select"); this.render(); this.setStatus("Dodano środek i dynamiczny okrąg opisany.");
            } catch (error) { this.setStatus("Nie udało się dodać okręgu opisanego: "+error.message, true); }
        }

        async createOrthocenter(pointIds) {
            if (!Array.isArray(pointIds) || pointIds.length !== 3) { return; }
            if (new Set(pointIds).size !== 3) {
                this.pendingOrthocenterPointIds = [];
                this.render();
                this.setStatus("Do wyznaczenia ortocentrum potrzebne są trzy różne punkty.", true);
                return;
            }
            const positions = pointIds.map((id) => this.resolveObjectPosition(this.findObject(id)));
            if (positions.some((point) => !point)) {
                this.setStatus("Nie udało się odczytać pozycji punktów trójkąta.", true);
                return;
            }
            const [a, b, c] = positions;
            const denominator = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
            if (Math.abs(denominator) < 1e-9) {
                this.pendingOrthocenterPointIds = [];
                this.render();
                this.setStatus("Wybrane punkty są współliniowe — ortocentrum nie jest określone.", true);
                return;
            }
            const label = this.labelInput ? this.labelInput.value.trim() : "H";
            const payload = {
                type: "geometry.orthocenter",
                data: {command: "orthocenter", pointA: pointIds[0], pointB: pointIds[1], pointC: pointIds[2], label},
                style: this.styleForNewObject("geometry.orthocenter"),
            };
            try {
                const result = await this.request(this.objectsUrl, {
                    method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(payload),
                });
                this.objects.push(result.object);
                this.pendingOrthocenterPointIds = [];
                this.setSingleSelection(result.object.object_id);
                this.pushHistory({kind: "create", object: result.object});
                this.setToolType("select");
                this.render();
                this.setStatus("Dodano dynamiczne ortocentrum trójkąta.");
            } catch (error) {
                this.setStatus("Nie udało się dodać ortocentrum: " + error.message, true);
            }
        }


        async createNinePointCenter(pointIds) {
            if (!Array.isArray(pointIds) || pointIds.length !== 3) { return; }
            if (new Set(pointIds).size !== 3) { this.pendingNinePointCenterPointIds=[]; this.render(); this.setStatus("Potrzebne są trzy różne punkty trójkąta.", true); return; }
            const positions=pointIds.map((id)=>this.resolveObjectPosition(this.findObject(id)));
            if (positions.some((point)=>!point)) { this.setStatus("Nie udało się odczytać pozycji punktów trójkąta.", true); return; }
            const [a,b,c]=positions;
            if (Math.abs((b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x)) < 1e-9) { this.pendingNinePointCenterPointIds=[]; this.render(); this.setStatus("Wybrane punkty są współliniowe.", true); return; }
            const label=this.labelInput ? this.labelInput.value.trim() : "N";
            try {
                const centerResult=await this.request(this.objectsUrl,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({type:"geometry.nine_point_center",data:{command:"nine_point_center",pointA:pointIds[0],pointB:pointIds[1],pointC:pointIds[2],label},style:this.styleForNewObject("geometry.nine_point_center")})});
                this.objects.push(centerResult.object);
                const midpointResult=await this.request(this.objectsUrl,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({type:"geometry.midpoint",data:{command:"midpoint",source:pointIds[0],target:pointIds[1],label:""},style:{...this.styleForNewObject("geometry.midpoint"),showLabel:false,visible:false}})});
                this.objects.push(midpointResult.object);
                const circleResult=await this.request(this.objectsUrl,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({type:"geometry.circle",data:{center:centerResult.object.object_id,point:midpointResult.object.object_id,label:""},style:this.styleForNewObject("geometry.circle")})});
                this.objects.push(circleResult.object);
                this.pendingNinePointCenterPointIds=[]; this.setSingleSelection(centerResult.object.object_id);
                [centerResult.object,midpointResult.object,circleResult.object].forEach((object)=>this.pushHistory({kind:"create",object}));
                this.setToolType("select"); this.render(); this.setStatus("Dodano środek i dynamiczny okrąg dziewięciu punktów.");
            } catch(error) { this.setStatus("Nie udało się dodać okręgu dziewięciu punktów: "+error.message,true); }
        }

        async createCentroid(pointIds) {
            if (!Array.isArray(pointIds) || pointIds.length !== 3) { return; }
            if (new Set(pointIds).size !== 3) {
                this.pendingCentroidPointIds = [];
                this.render();
                this.setStatus("Do wyznaczenia środka ciężkości potrzebne są trzy różne punkty.", true);
                return;
            }
            const label = this.labelInput ? this.labelInput.value.trim() : "G";
            const payload = {
                type: "geometry.centroid",
                data: {command: "centroid", pointA: pointIds[0], pointB: pointIds[1], pointC: pointIds[2], label},
                style: this.styleForNewObject("geometry.centroid"),
            };
            try {
                const result = await this.request(this.objectsUrl, {
                    method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(payload),
                });
                this.objects.push(result.object);
                this.pendingCentroidPointIds = [];
                this.setSingleSelection(result.object.object_id);
                this.pushHistory({kind: "create", object: result.object});
                this.setToolType("select");
                this.render();
                this.setStatus("Dodano dynamiczny środek ciężkości trójkąta.");
            } catch (error) {
                this.setStatus("Nie udało się dodać środka ciężkości: " + error.message, true);
            }
        }

        async createIncenter(pointIds) {
            if (!Array.isArray(pointIds) || pointIds.length !== 3) { return; }
            if (new Set(pointIds).size !== 3) { this.pendingIncenterPointIds=[]; this.render(); this.setStatus("Potrzebne są trzy różne punkty trójkąta.",true); return; }
            const positions=pointIds.map((id)=>this.resolveObjectPosition(this.findObject(id)));
            if (positions.some((point)=>!point)) { this.setStatus("Nie udało się odczytać pozycji punktów trójkąta.",true); return; }
            const [a,b,c]=positions;
            if (Math.abs((b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x)) < 1e-9) { this.pendingIncenterPointIds=[]; this.render(); this.setStatus("Wybrane punkty są współliniowe — okrąg wpisany nie jest określony.",true); return; }
            const label=this.labelInput ? this.labelInput.value.trim() : "I";
            try {
                const centerResult=await this.request(this.objectsUrl,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({type:"geometry.incenter",data:{command:"incenter",pointA:pointIds[0],pointB:pointIds[1],pointC:pointIds[2],label},style:this.styleForNewObject("geometry.incenter")})});
                this.objects.push(centerResult.object);
                const footResult=await this.request(this.objectsUrl,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({type:"geometry.perpendicular_projection",data:{command:"perpendicular_projection",point:centerResult.object.object_id,lineA:pointIds[0],lineB:pointIds[1],label:""},style:{...this.styleForNewObject("geometry.perpendicular_projection"),showLabel:false,visible:false}})});
                this.objects.push(footResult.object);
                const circleResult=await this.request(this.objectsUrl,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({type:"geometry.circle",data:{center:centerResult.object.object_id,point:footResult.object.object_id,label:""},style:this.styleForNewObject("geometry.circle")})});
                this.objects.push(circleResult.object);
                this.pendingIncenterPointIds=[]; this.setSingleSelection(centerResult.object.object_id);
                [centerResult.object,footResult.object,circleResult.object].forEach((object)=>this.pushHistory({kind:"create",object}));
                this.setToolType("select"); this.render(); this.setStatus("Dodano środek i dynamiczny okrąg wpisany.");
            } catch(error) { this.setStatus("Nie udało się dodać okręgu wpisanego: "+error.message,true); }
        }

        async createExcenter(pointIds) {
            if (!Array.isArray(pointIds) || pointIds.length !== 3) { return; }
            if (new Set(pointIds).size !== 3) { this.pendingExcenterPointIds=[]; this.render(); this.setStatus("Potrzebne są trzy różne punkty trójkąta.",true); return; }
            const positions=pointIds.map((id)=>this.resolveObjectPosition(this.findObject(id)));
            if (positions.some((point)=>!point)) { this.setStatus("Nie udało się odczytać pozycji punktów trójkąta.",true); return; }
            const [a,b,c]=positions;
            if (Math.abs((b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x)) < 1e-9) { this.pendingExcenterPointIds=[]; this.render(); this.setStatus("Wybrane punkty są współliniowe — okrąg dopisany nie jest określony.",true); return; }
            const oppositeVertex=this.excenterVertexInput ? this.excenterVertexInput.value : "A";
            const label=this.labelInput ? this.labelInput.value.trim() : "I_a";
            const sidePoints={A:[pointIds[1],pointIds[2]],B:[pointIds[0],pointIds[2]],C:[pointIds[0],pointIds[1]]}[oppositeVertex] || [pointIds[1],pointIds[2]];
            try {
                const centerResult=await this.request(this.objectsUrl,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({type:"geometry.excenter",data:{command:"excenter",pointA:pointIds[0],pointB:pointIds[1],pointC:pointIds[2],oppositeVertex,label},style:this.styleForNewObject("geometry.excenter")})});
                this.objects.push(centerResult.object);
                const footResult=await this.request(this.objectsUrl,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({type:"geometry.perpendicular_projection",data:{command:"perpendicular_projection",point:centerResult.object.object_id,lineA:sidePoints[0],lineB:sidePoints[1],label:""},style:{...this.styleForNewObject("geometry.perpendicular_projection"),showLabel:false,visible:false}})});
                this.objects.push(footResult.object);
                const circleResult=await this.request(this.objectsUrl,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({type:"geometry.circle",data:{center:centerResult.object.object_id,point:footResult.object.object_id,label:""},style:this.styleForNewObject("geometry.circle")})});
                this.objects.push(circleResult.object);
                this.pendingExcenterPointIds=[]; this.setSingleSelection(centerResult.object.object_id);
                [centerResult.object,footResult.object,circleResult.object].forEach((object)=>this.pushHistory({kind:"create",object}));
                this.setToolType("select"); this.render(); this.setStatus("Dodano środek i dynamiczny okrąg dopisany naprzeciw wierzchołka "+oppositeVertex+".");
            } catch(error) { this.setStatus("Nie udało się dodać okręgu dopisanego: "+error.message,true); }
        }

        async createExcircleTouchpoint(pointIds) {
            if (!Array.isArray(pointIds) || pointIds.length !== 3) { return; }
            if (new Set(pointIds).size !== 3) {
                this.pendingExcircleTouchpointPointIds = []; this.render();
                this.setStatus("Potrzebne są trzy różne punkty trójkąta.", true); return;
            }
            const positions = pointIds.map((id) => this.resolveObjectPosition(this.findObject(id)));
            if (positions.some((point) => !point)) { this.setStatus("Nie udało się odczytać pozycji punktów trójkąta.", true); return; }
            const [a,b,c] = positions;
            const area2 = Math.abs((b.x-a.x)*(c.y-a.y) - (b.y-a.y)*(c.x-a.x));
            if (area2 < 1e-9) {
                this.pendingExcircleTouchpointPointIds = []; this.render();
                this.setStatus("Wybrane punkty są współliniowe — okrąg dopisany nie jest określony.", true); return;
            }
            const oppositeVertex = this.excircleVertexInput ? this.excircleVertexInput.value : "A";
            const side = this.excircleSideInput ? this.excircleSideInput.value : "BC";
            const label = this.labelInput ? this.labelInput.value.trim() : "T_a";
            const payload = {type:"geometry.excircle_touchpoint", data:{command:"excircle_touchpoint", pointA:pointIds[0], pointB:pointIds[1], pointC:pointIds[2], oppositeVertex, side, label}, style:this.styleForNewObject("geometry.excircle_touchpoint")};
            try {
                const result = await this.request(this.objectsUrl, {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(payload)});
                this.objects.push(result.object); this.pendingExcircleTouchpointPointIds = [];
                this.setSingleSelection(result.object.object_id); this.pushHistory({kind:"create", object:result.object});
                this.setToolType("select"); this.render();
                this.setStatus("Dodano punkt styczności okręgu dopisanego I_" + oppositeVertex.toLowerCase() + " z prostą " + side + ".");
            } catch (error) { this.setStatus("Nie udało się dodać punktu styczności okręgu dopisanego: " + error.message, true); }
        }

        async createIncircleTouchpoint(pointIds) {
            if (!Array.isArray(pointIds) || pointIds.length !== 3) { return; }
            if (new Set(pointIds).size !== 3) {
                this.pendingIncircleTouchpointPointIds = [];
                this.render();
                this.setStatus("Potrzebne są trzy różne punkty trójkąta.", true);
                return;
            }
            const positions = pointIds.map((id) => this.resolveObjectPosition(this.findObject(id)));
            if (positions.some((point) => !point)) {
                this.setStatus("Nie udało się odczytać pozycji punktów trójkąta.", true);
                return;
            }
            const [a,b,c] = positions;
            const area2 = Math.abs((b.x-a.x)*(c.y-a.y) - (b.y-a.y)*(c.x-a.x));
            if (area2 < 1e-9) {
                this.pendingIncircleTouchpointPointIds = [];
                this.render();
                this.setStatus("Wybrane punkty są współliniowe — okrąg wpisany nie jest określony.", true);
                return;
            }
            const side = this.incircleSideInput ? this.incircleSideInput.value : "AB";
            const label = this.labelInput ? this.labelInput.value.trim() : "T";
            const payload = {
                type: "geometry.incircle_touchpoint",
                data: {command: "incircle_touchpoint", pointA: pointIds[0], pointB: pointIds[1], pointC: pointIds[2], side, label},
                style: this.styleForNewObject("geometry.incircle_touchpoint"),
            };
            try {
                const result = await this.request(this.objectsUrl, {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(payload)});
                this.objects.push(result.object);
                this.pendingIncircleTouchpointPointIds = [];
                this.setSingleSelection(result.object.object_id);
                this.pushHistory({kind:"create", object:result.object});
                this.setToolType("select");
                this.render();
                this.setStatus("Dodano dynamiczny punkt styczności okręgu wpisanego z bokiem " + side + ".");
            } catch (error) {
                this.setStatus("Nie udało się dodać punktu styczności: " + error.message, true);
            }
        }

        async createReflectionAcrossLine(pointIds) {
            if (!Array.isArray(pointIds) || pointIds.length !== 3) {
                this.setStatus("Do utworzenia odbicia potrzebne są trzy punkty.", true);
                return;
            }
            if (pointIds[1] === pointIds[2]) {
                this.pendingReflectionPointIds = [];
                this.render();
                this.setStatus("Prosta odbicia musi być wyznaczona przez dwa różne punkty.", true);
                return;
            }
            const label = this.labelInput ? this.labelInput.value.trim() : "";
            const payload = {
                type: "geometry.reflection_across_line",
                data: {command: "reflection_across_line", point: pointIds[0], lineA: pointIds[1], lineB: pointIds[2], label},
                style: this.styleForNewObject("geometry.reflection_across_line"),
            };
            try {
                const result = await this.request(this.objectsUrl, {
                    method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(payload),
                });
                this.objects.push(result.object);
                this.pendingReflectionPointIds = [];
                this.setSingleSelection(result.object.object_id);
                this.pushHistory({kind: "create", object: result.object});
                this.setToolType("select");
                this.render();
                this.setStatus("Dodano dynamiczne odbicie punktu względem prostej.");
            } catch (error) {
                this.setStatus("Nie udało się dodać odbicia punktu: " + error.message, true);
            }
        }

        async createRotationAroundPoint(pointIds) {
            if (!Array.isArray(pointIds) || pointIds.length !== 2) {
                this.setStatus("Do utworzenia obrotu potrzebne są dwa punkty.", true);
                return;
            }
            if (pointIds[0] === pointIds[1]) {
                this.pendingRotationPointIds = [];
                this.render();
                this.setStatus("Punkt obracany i środek obrotu muszą być różne.", true);
                return;
            }
            const angleDegrees = this.rotationAngleInput ? Number(this.rotationAngleInput.value) : 90;
            if (!Number.isFinite(angleDegrees)) {
                this.setStatus("Kąt obrotu musi być liczbą.", true);
                return;
            }
            const label = this.labelInput ? this.labelInput.value.trim() : "";
            const payload = {
                type: "geometry.rotation_around_point",
                data: {command: "rotation_around_point", point: pointIds[0], center: pointIds[1], angleDegrees, label},
                style: this.styleForNewObject("geometry.rotation_around_point"),
            };
            try {
                const result = await this.request(this.objectsUrl, {
                    method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(payload),
                });
                this.objects.push(result.object);
                this.pendingRotationPointIds = [];
                this.setSingleSelection(result.object.object_id);
                this.pushHistory({kind: "create", object: result.object});
                this.setToolType("select");
                this.render();
                this.setStatus("Dodano dynamiczny obrót punktu o " + angleDegrees + "°.");
            } catch (error) {
                this.setStatus("Nie udało się dodać obrotu punktu: " + error.message, true);
            }
        }

        async createCentralReflection(pointIds) {
            if (!Array.isArray(pointIds) || pointIds.length !== 2) { return; }
            if (pointIds[0] === pointIds[1]) {
                this.pendingCentralReflectionPointIds = [];
                this.render();
                this.setStatus("Punkt odbijany i środek symetrii muszą być różne.", true);
                return;
            }
            const label = this.labelInput ? this.labelInput.value.trim() : "";
            const payload = {
                type: "geometry.central_reflection",
                data: {command: "central_reflection", point: pointIds[0], center: pointIds[1], label},
                style: this.styleForNewObject("geometry.central_reflection"),
            };
            try {
                const result = await this.request(this.objectsUrl, {
                    method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(payload),
                });
                this.objects.push(result.object);
                this.pendingCentralReflectionPointIds = [];
                this.setSingleSelection(result.object.object_id);
                this.pushHistory({kind: "create", object: result.object});
                this.setToolType("select");
                this.render();
                this.setStatus("Dodano dynamiczną symetrię środkową punktu.");
            } catch (error) {
                this.setStatus("Nie udało się dodać symetrii środkowej: " + error.message, true);
            }
        }

        async createHomothety(pointIds) {
            if (!Array.isArray(pointIds) || pointIds.length !== 2) { return; }
            if (pointIds[0] === pointIds[1]) {
                this.pendingHomothetyPointIds = [];
                this.render();
                this.setStatus("Punkt i środek jednokładności muszą być różne.", true);
                return;
            }
            const scaleFactor = this.homothetyScaleInput ? Number(this.homothetyScaleInput.value) : 2;
            if (!Number.isFinite(scaleFactor)) {
                this.setStatus("Współczynnik jednokładności k musi być liczbą.", true);
                return;
            }
            const label = this.labelInput ? this.labelInput.value.trim() : "";
            const payload = {
                type: "geometry.homothety",
                data: {command: "homothety", point: pointIds[0], center: pointIds[1], scaleFactor, label},
                style: this.styleForNewObject("geometry.homothety"),
            };
            try {
                const result = await this.request(this.objectsUrl, {
                    method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(payload),
                });
                this.objects.push(result.object);
                this.pendingHomothetyPointIds = [];
                this.setSingleSelection(result.object.object_id);
                this.pushHistory({kind: "create", object: result.object});
                this.setToolType("select");
                this.render();
                this.setStatus("Dodano dynamiczną jednokładność punktu ze współczynnikiem k=" + scaleFactor + ".");
            } catch (error) {
                this.setStatus("Nie udało się dodać jednokładności: " + error.message, true);
            }
        }

        async createTranslationByVector(pointIds) {
            if (!Array.isArray(pointIds) || pointIds.length !== 3) { return; }
            if (new Set(pointIds).size !== 3) {
                this.pendingTranslationPointIds = [];
                this.render();
                this.setStatus("Punkt przesuwany oraz oba punkty wektora muszą być różne.", true);
                return;
            }
            const label = this.labelInput ? this.labelInput.value.trim() : "";
            const payload = {
                type: "geometry.translation_by_vector",
                data: {command: "translation_by_vector", point: pointIds[0], vectorStart: pointIds[1], vectorEnd: pointIds[2], label},
                style: this.styleForNewObject("geometry.translation_by_vector"),
            };
            try {
                const result = await this.request(this.objectsUrl, {
                    method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(payload),
                });
                this.objects.push(result.object);
                this.pendingTranslationPointIds = [];
                this.setSingleSelection(result.object.object_id);
                this.pushHistory({kind: "create", object: result.object});
                this.setToolType("select");
                this.render();
                this.setStatus("Dodano dynamiczną translację punktu o wskazany wektor.");
            } catch (error) {
                this.setStatus("Nie udało się dodać translacji punktu: " + error.message, true);
            }
        }

        async createLineBetweenPoints(startId, endId) {
            if (startId === endId) {
                this.setStatus("Obiekt zależny musi używać dwóch różnych punktów.", true);
                return;
            }

            const selectedType = this.currentToolType();
            const objectType = this.objectTypeForTool(selectedType);
            const label = this.labelInput ? this.labelInput.value.trim() : "";
            const payload = {
                type: objectType,
                data: objectType === "geometry.circle" ? {
                    center: startId,
                    point: endId,
                    label: label,
                } : {
                    source: startId,
                    target: endId,
                    label: label,
                    ...(objectType === "geometry.midpoint" ? {command: "midpoint"} : {}),
                },
                style: this.styleForNewObject(selectedType),
            };

            try {
                const result = await this.request(this.objectsUrl, {
                    method: "POST",
                    headers: {"Content-Type": "application/json"},
                    body: JSON.stringify(payload),
                });
                this.objects.push(result.object);
                this.lastLoadedPlotDraftKey = null;
                this.setSingleSelection(result.object.object_id);
                this.pendingLineStartId = null;
                this.pushHistory({kind: "create", object: result.object});
                this.switchToSelectAfterGeometryCreation(objectType);
                this.render();
                this.setStatus("Dodano " + result.object.type + " na podstawie punktów " + startId + " i " + endId + ". Możesz teraz przesuwać jego punkty sterujące.");
            } catch (error) {
                this.setStatus("Nie udało się dodać obiektu zależnego: " + error.message, true);
            }
        }

        handleObjectPointerDown(event, objectId) {
            event.preventDefault();
            event.stopPropagation();
            this.ignoreNextCanvasClick = true;

            const object = this.findObject(objectId);
            if (!object) {
                return;
            }

            if (!this.currentToolCreatesByTwoPoints()) {
                if (event.shiftKey || event.ctrlKey || event.metaKey) {
                    this.toggleSelection(objectId);
                } else if (!this.isSelected(objectId) && !this.hasSelectedAncestor(objectId)) {
                    this.setSingleSelection(objectId);
                } else {
                    this.selectedObjectId = objectId;
                }
                this.updateContentPanel();
                this.updateStylePanel();
                this.updatePluginPropertiesPanel();
                this.updatePluginActionsPanel();
                if (this.selectedObjectId) {
                    this.openEditPanel("object");
                }
                if (this.selectionCount) {
                    this.selectionCount.textContent = "Zaznaczono: " + this.selectedObjectIds.size;
                }
            }

            if (this.currentToolCreatesLineIntersection()) {
                if (!this.pointIsAllowedForCurrentTool(object)) {
                    this.setStatus(this.currentToolPointErrorMessage(), true);
                    return;
                }
                if (this.pendingIntersectionPointIds.includes(objectId)) {
                    this.setStatus("Ten punkt został już wybrany. Wskaż inny punkt.", true);
                    return;
                }
                this.pendingIntersectionPointIds.push(objectId);
                this.setSingleSelection(objectId);
                this.render();
                const count = this.pendingIntersectionPointIds.length;
                if (count < 4) {
                    const descriptions = ["drugi punkt pierwszej prostej", "pierwszy punkt drugiej prostej", "drugi punkt drugiej prostej"];
                    this.setStatus("Wybrano punkt " + count + "/4. Wskaż " + descriptions[count - 1] + ".");
                } else {
                    this.createLineIntersection([...this.pendingIntersectionPointIds]);
                }
                return;
            }

            if (this.currentToolCreatesPerpendicularProjection()) {
                if (!this.pointIsAllowedForCurrentTool(object)) {
                    this.setStatus(this.currentToolPointErrorMessage(), true);
                    return;
                }
                if (this.pendingProjectionPointIds.includes(objectId)) {
                    this.setStatus("Ten punkt został już wybrany. Wskaż inny punkt.", true);
                    return;
                }
                this.pendingProjectionPointIds.push(objectId);
                this.setSingleSelection(objectId);
                this.render();
                const count = this.pendingProjectionPointIds.length;
                if (count < 3) {
                    const descriptions = ["pierwszy punkt prostej", "drugi punkt prostej"];
                    this.setStatus("Wybrano punkt " + count + "/3. Wskaż " + descriptions[count - 1] + ".");
                } else {
                    this.createPerpendicularProjection([...this.pendingProjectionPointIds]);
                }
                return;
            }

            if (this.currentToolCreatesSegmentProjection()) {
                if (!this.pointIsAllowedForCurrentTool(object)) {
                    this.setStatus(this.currentToolPointErrorMessage(), true);
                    return;
                }
                if (this.pendingSegmentProjectionPointIds.includes(objectId)) {
                    this.setStatus("Ten punkt został już wybrany. Wskaż inny punkt.", true);
                    return;
                }
                this.pendingSegmentProjectionPointIds.push(objectId);
                this.setSingleSelection(objectId);
                this.render();
                const count = this.pendingSegmentProjectionPointIds.length;
                if (count < 3) {
                    const descriptions = ["pierwszy koniec odcinka", "drugi koniec odcinka"];
                    this.setStatus("Wybrano punkt " + count + "/3. Wskaż " + descriptions[count - 1] + ".");
                } else {
                    this.createSegmentProjection([...this.pendingSegmentProjectionPointIds]);
                }
                return;
            }

            if (this.currentToolCreatesCircleNearestPoint()) {
                if (!this.pointIsAllowedForCurrentTool(object)) {
                    this.setStatus(this.currentToolPointErrorMessage(), true);
                    return;
                }
                if (this.pendingCircleNearestPointIds.includes(objectId)) {
                    this.setStatus("Ten punkt został już wybrany. Wskaż inny punkt.", true);
                    return;
                }
                this.pendingCircleNearestPointIds.push(objectId);
                this.setSingleSelection(objectId);
                this.render();
                const count = this.pendingCircleNearestPointIds.length;
                if (count < 3) {
                    const descriptions = ["środek okręgu", "punkt wyznaczający promień"];
                    this.setStatus("Wybrano punkt " + count + "/3. Wskaż " + descriptions[count - 1] + ".");
                } else {
                    this.createCircleNearestPoint([...this.pendingCircleNearestPointIds]);
                }
                return;
            }

            if (this.currentToolCreatesLineCircleIntersection()) {
                if (!this.pointIsAllowedForCurrentTool(object)) {
                    this.setStatus(this.currentToolPointErrorMessage(), true);
                    return;
                }
                if (this.pendingLineCircleIntersectionPointIds.includes(objectId)) {
                    this.setStatus("Ten punkt został już wybrany. Wskaż inny punkt.", true);
                    return;
                }
                this.pendingLineCircleIntersectionPointIds.push(objectId);
                this.setSingleSelection(objectId);
                this.render();
                const count = this.pendingLineCircleIntersectionPointIds.length;
                if (count < 4) {
                    const descriptions = ["drugi punkt prostej", "środek okręgu", "punkt wyznaczający promień"];
                    this.setStatus("Wybrano punkt " + count + "/4. Wskaż " + descriptions[count - 1] + ".");
                } else {
                    this.createLineCircleIntersection([...this.pendingLineCircleIntersectionPointIds]);
                }
                return;
            }

            if (this.currentToolCreatesCircleCircleIntersection()) {
                if (!this.pointIsAllowedForCurrentTool(object)) {
                    this.setStatus(this.currentToolPointErrorMessage(), true);
                    return;
                }
                if (this.pendingCircleCircleIntersectionPointIds.includes(objectId)) {
                    this.setStatus("Ten punkt został już wybrany. Wskaż inny punkt.", true);
                    return;
                }
                this.pendingCircleCircleIntersectionPointIds.push(objectId);
                this.setSingleSelection(objectId);
                this.render();
                const count = this.pendingCircleCircleIntersectionPointIds.length;
                if (count < 4) {
                    const descriptions = ["punkt wyznaczający promień pierwszego okręgu", "środek drugiego okręgu", "punkt wyznaczający promień drugiego okręgu"];
                    this.setStatus("Wybrano punkt " + count + "/4. Wskaż " + descriptions[count - 1] + ".");
                } else {
                    this.createCircleCircleIntersection([...this.pendingCircleCircleIntersectionPointIds]);
                }
                return;
            }

            if (this.currentToolCreatesCircumcenter()) {
                if (!this.pointIsAllowedForCurrentTool(object)) {
                    this.setStatus(this.currentToolPointErrorMessage(), true);
                    return;
                }
                if (this.pendingCircumcenterPointIds.includes(objectId)) {
                    this.setStatus("Ten punkt został już wybrany. Wskaż inny punkt.", true);
                    return;
                }
                this.pendingCircumcenterPointIds.push(objectId);
                this.setSingleSelection(objectId);
                this.render();
                const count = this.pendingCircumcenterPointIds.length;
                if (count < 3) {
                    const descriptions = ["drugi punkt trójkąta", "trzeci punkt trójkąta"];
                    this.setStatus("Wybrano punkt " + count + "/3. Wskaż " + descriptions[count - 1] + ".");
                } else {
                    this.createCircumcenter([...this.pendingCircumcenterPointIds]);
                }
                return;
            }

            if (this.currentToolCreatesOrthocenter()) {
                if (!this.pointIsAllowedForCurrentTool(object)) {
                    this.setStatus(this.currentToolPointErrorMessage(), true);
                    return;
                }
                if (this.pendingOrthocenterPointIds.includes(objectId)) {
                    this.setStatus("Ten punkt został już wybrany. Wskaż inny punkt.", true);
                    return;
                }
                this.pendingOrthocenterPointIds.push(objectId);
                this.setSingleSelection(objectId);
                this.render();
                const count = this.pendingOrthocenterPointIds.length;
                if (count < 3) {
                    const descriptions = ["drugi punkt trójkąta", "trzeci punkt trójkąta"];
                    this.setStatus("Wybrano punkt " + count + "/3. Wskaż " + descriptions[count - 1] + ".");
                } else {
                    this.createOrthocenter([...this.pendingOrthocenterPointIds]);
                }
                return;
            }


            if (this.currentToolCreatesNinePointCenter()) {
                if (!this.pointIsAllowedForCurrentTool(object)) {
                    this.setStatus(this.currentToolPointErrorMessage(), true);
                    return;
                }
                if (this.pendingNinePointCenterPointIds.includes(objectId)) {
                    this.setStatus("Ten punkt został już wybrany. Wskaż inny punkt.", true);
                    return;
                }
                this.pendingNinePointCenterPointIds.push(objectId);
                this.setSingleSelection(objectId);
                this.render();
                const count = this.pendingNinePointCenterPointIds.length;
                if (count < 3) {
                    const descriptions = ["drugi punkt trójkąta", "trzeci punkt trójkąta"];
                    this.setStatus("Wybrano punkt " + count + "/3. Wskaż " + descriptions[count - 1] + ".");
                } else {
                    this.createNinePointCenter([...this.pendingNinePointCenterPointIds]);
                }
                return;
            }

            if (this.currentToolCreatesCentroid()) {
                if (!this.pointIsAllowedForCurrentTool(object)) {
                    this.setStatus(this.currentToolPointErrorMessage(), true);
                    return;
                }
                if (this.pendingCentroidPointIds.includes(objectId)) {
                    this.setStatus("Ten punkt został już wybrany. Wskaż inny punkt.", true);
                    return;
                }
                this.pendingCentroidPointIds.push(objectId);
                this.setSingleSelection(objectId);
                this.render();
                const count = this.pendingCentroidPointIds.length;
                if (count < 3) {
                    const descriptions = ["drugi punkt trójkąta", "trzeci punkt trójkąta"];
                    this.setStatus("Wybrano punkt " + count + "/3. Wskaż " + descriptions[count - 1] + ".");
                } else {
                    this.createCentroid([...this.pendingCentroidPointIds]);
                }
                return;
            }

            if (this.currentToolCreatesIncenter()) {
                if (!this.pointIsAllowedForCurrentTool(object)) {
                    this.setStatus(this.currentToolPointErrorMessage(), true);
                    return;
                }
                if (this.pendingIncenterPointIds.includes(objectId)) {
                    this.setStatus("Ten punkt został już wybrany. Wskaż inny punkt.", true);
                    return;
                }
                this.pendingIncenterPointIds.push(objectId);
                this.setSingleSelection(objectId);
                this.render();
                const count = this.pendingIncenterPointIds.length;
                if (count < 3) {
                    const descriptions = ["drugi punkt trójkąta", "trzeci punkt trójkąta"];
                    this.setStatus("Wybrano punkt " + count + "/3. Wskaż " + descriptions[count - 1] + ".");
                } else {
                    this.createIncenter([...this.pendingIncenterPointIds]);
                }
                return;
            }

            if (this.currentToolCreatesExcenter()) {
                if (!this.pointIsAllowedForCurrentTool(object)) {
                    this.setStatus(this.currentToolPointErrorMessage(), true);
                    return;
                }
                if (this.pendingExcenterPointIds.includes(objectId)) {
                    this.setStatus("Ten punkt został już wybrany. Wskaż inny punkt.", true);
                    return;
                }
                this.pendingExcenterPointIds.push(objectId);
                this.setSingleSelection(objectId);
                this.render();
                const count = this.pendingExcenterPointIds.length;
                if (count < 3) {
                    const descriptions = ["drugi punkt trójkąta", "trzeci punkt trójkąta"];
                    this.setStatus("Wybrano punkt " + count + "/3. Wskaż " + descriptions[count - 1] + ".");
                } else {
                    this.createExcenter([...this.pendingExcenterPointIds]);
                }
                return;
            }

            if (this.currentToolCreatesExcircleTouchpoint()) {
                if (!this.pointIsAllowedForCurrentTool(object)) { this.setStatus(this.currentToolPointErrorMessage(), true); return; }
                if (this.pendingExcircleTouchpointPointIds.includes(objectId)) { this.setStatus("Ten punkt został już wybrany. Wskaż inny punkt.", true); return; }
                this.pendingExcircleTouchpointPointIds.push(objectId); this.setSingleSelection(objectId); this.render();
                const count = this.pendingExcircleTouchpointPointIds.length;
                if (count < 3) { const descriptions=["drugi punkt trójkąta","trzeci punkt trójkąta"]; this.setStatus("Wybrano punkt " + count + "/3. Wskaż " + descriptions[count-1] + "."); }
                else { this.createExcircleTouchpoint([...this.pendingExcircleTouchpointPointIds]); }
                return;
            }

            if (this.currentToolCreatesIncircleTouchpoint()) {
                if (!this.pointIsAllowedForCurrentTool(object)) {
                    this.setStatus(this.currentToolPointErrorMessage(), true);
                    return;
                }
                if (this.pendingIncircleTouchpointPointIds.includes(objectId)) {
                    this.setStatus("Ten punkt został już wybrany. Wskaż inny punkt.", true);
                    return;
                }
                this.pendingIncircleTouchpointPointIds.push(objectId);
                this.setSingleSelection(objectId);
                this.render();
                const count = this.pendingIncircleTouchpointPointIds.length;
                if (count < 3) {
                    const descriptions = ["drugi punkt trójkąta", "trzeci punkt trójkąta"];
                    this.setStatus("Wybrano punkt " + count + "/3. Wskaż " + descriptions[count - 1] + ".");
                } else {
                    this.createIncircleTouchpoint([...this.pendingIncircleTouchpointPointIds]);
                }
                return;
            }

            if (this.currentToolCreatesReflectionAcrossLine()) {
                if (!this.pointIsAllowedForCurrentTool(object)) {
                    this.setStatus(this.currentToolPointErrorMessage(), true);
                    return;
                }
                if (this.pendingReflectionPointIds.includes(objectId)) {
                    this.setStatus("Ten punkt został już wybrany. Wskaż inny punkt.", true);
                    return;
                }
                this.pendingReflectionPointIds.push(objectId);
                this.setSingleSelection(objectId);
                this.render();
                const count = this.pendingReflectionPointIds.length;
                if (count < 3) {
                    const descriptions = ["pierwszy punkt prostej odbicia", "drugi punkt prostej odbicia"];
                    this.setStatus("Wybrano punkt " + count + "/3. Wskaż " + descriptions[count - 1] + ".");
                } else {
                    this.createReflectionAcrossLine([...this.pendingReflectionPointIds]);
                }
                return;
            }

            if (this.currentToolCreatesRotationAroundPoint()) {
                if (!this.pointIsAllowedForCurrentTool(object)) {
                    this.setStatus(this.currentToolPointErrorMessage(), true);
                    return;
                }
                if (this.pendingRotationPointIds.includes(objectId)) {
                    this.setStatus("Ten punkt został już wybrany. Wskaż inny punkt.", true);
                    return;
                }
                this.pendingRotationPointIds.push(objectId);
                this.setSingleSelection(objectId);
                this.render();
                const count = this.pendingRotationPointIds.length;
                if (count < 2) {
                    this.setStatus("Wybrano punkt obracany. Wskaż środek obrotu.");
                } else {
                    this.createRotationAroundPoint([...this.pendingRotationPointIds]);
                }
                return;
            }

            if (this.currentToolCreatesCentralReflection()) {
                if (!this.pointIsAllowedForCurrentTool(object)) { this.setStatus(this.currentToolPointErrorMessage(), true); return; }
                if (this.pendingCentralReflectionPointIds.includes(objectId)) { this.setStatus("Ten punkt został już wybrany. Wskaż inny punkt.", true); return; }
                this.pendingCentralReflectionPointIds.push(objectId);
                this.setSingleSelection(objectId);
                this.render();
                if (this.pendingCentralReflectionPointIds.length < 2) { this.setStatus("Wybrano punkt odbijany. Wskaż środek symetrii."); }
                else { this.createCentralReflection([...this.pendingCentralReflectionPointIds]); }
                return;
            }

            if (this.currentToolCreatesHomothety()) {
                if (!this.pointIsAllowedForCurrentTool(object)) { this.setStatus(this.currentToolPointErrorMessage(), true); return; }
                if (this.pendingHomothetyPointIds.includes(objectId)) { this.setStatus("Ten punkt został już wybrany. Wskaż inny punkt.", true); return; }
                this.pendingHomothetyPointIds.push(objectId);
                this.setSingleSelection(objectId);
                this.render();
                if (this.pendingHomothetyPointIds.length < 2) { this.setStatus("Wybrano punkt. Wskaż środek jednokładności."); }
                else { this.createHomothety([...this.pendingHomothetyPointIds]); }
                return;
            }

            if (this.currentToolCreatesTranslationByVector()) {
                if (!this.pointIsAllowedForCurrentTool(object)) {
                    this.setStatus(this.currentToolPointErrorMessage(), true);
                    return;
                }
                if (this.pendingTranslationPointIds.includes(objectId)) {
                    this.setStatus("Ten punkt został już wybrany. Wskaż inny punkt.", true);
                    return;
                }
                this.pendingTranslationPointIds.push(objectId);
                this.setSingleSelection(objectId);
                this.render();
                const count = this.pendingTranslationPointIds.length;
                if (count < 3) {
                    const descriptions = ["początek wektora translacji", "koniec wektora translacji"];
                    this.setStatus("Wybrano punkt " + count + "/3. Wskaż " + descriptions[count - 1] + ".");
                } else {
                    this.createTranslationByVector([...this.pendingTranslationPointIds]);
                }
                return;
            }

            if (this.currentToolCreatesPolygon()) {
                if (!this.pointIsAllowedForCurrentTool(object)) {
                    this.setStatus(this.currentToolPointErrorMessage(), true);
                    return;
                }
                this.addPointToPendingPolygon(objectId);
                return;
            }

            if (this.currentToolCreatesByTwoPoints()) {
                if (!this.pointIsAllowedForCurrentTool(object)) {
                    this.setStatus(this.currentToolPointErrorMessage(), true);
                    return;
                }
                if (!this.pendingLineStartId) {
                    this.pendingLineStartId = objectId;
                    this.setSingleSelection(objectId);
                    this.render();
                    this.setStatus("Wybrano pierwszy punkt " + objectId + ". Kliknij drugi dozwolony punkt.");
                    return;
                }
                this.createLineBetweenPoints(this.pendingLineStartId, objectId);
                return;
            }

            if (event.shiftKey || event.ctrlKey || event.metaKey) {
                this.render();
                const count = this.selectedObjectIds.size;
                this.setStatus("Zaznaczono " + count + " obiekt" + (count === 1 ? "." : "ów."));
                return;
            }

            if (!isPositionedObject(object)) {
                this.render();
                this.setStatus("Zaznaczono obiekt " + objectId + ".");
                return;
            }

            const movableObjects = this.positionedSelectedObjects();
            const startPoint = svgPointFromEvent(this.svg, event);
            const originals = {};
            for (const movable of movableObjects) {
                if (isRelativeLabel(movable)) {
                    const position = this.relativeLabelPosition(movable);
                    if (position) {
                        originals[movable.object_id] = {x: position.x, y: position.y, dx: Number(movable.data.dx || 0), dy: Number(movable.data.dy || 0), relative: true};
                    }
                } else {
                    const originalX = Number(movable.data && movable.data.x);
                    const originalY = Number(movable.data && movable.data.y);
                    if (Number.isFinite(originalX) && Number.isFinite(originalY)) { originals[movable.object_id] = {x: originalX, y: originalY}; }
                }
            }

            if (Object.keys(originals).length === 0) {
                return;
            }

            this.dragState = {
                objectId,
                objectIds: Object.keys(originals),
                pointerId: event.pointerId,
                startX: startPoint.x,
                startY: startPoint.y,
                originals,
                moved: false,
            };

            if (this.svg.setPointerCapture) {
                try {
                    this.svg.setPointerCapture(event.pointerId);
                } catch (error) {
                    // Some browsers are strict about pointer capture on SVG roots.
                    // Selection already happened above, so dragging can still work through bubbled pointer events.
                }
            }

            this.render();
            this.setStatus("Przesuwasz " + this.dragState.objectIds.length + " obiekt" + (this.dragState.objectIds.length === 1 ? "." : "ów."));
        }

        handlePointerMove(event) {
            if (this.selectionBoxState && event.pointerId === this.selectionBoxState.pointerId) {
                event.preventDefault();
                const currentPoint = svgPointFromEvent(this.svg, event);
                const dx = currentPoint.x - this.selectionBoxState.startX;
                const dy = currentPoint.y - this.selectionBoxState.startY;
                this.selectionBoxState.currentX = currentPoint.x;
                this.selectionBoxState.currentY = currentPoint.y;
                if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
                    this.selectionBoxState.moved = true;
                }
                this.updateSelectionBoxElement();
                return;
            }

            if (!this.dragState || event.pointerId !== this.dragState.pointerId) {
                return;
            }

            event.preventDefault();
            const currentPoint = svgPointFromEvent(this.svg, event);
            const dx = currentPoint.x - this.dragState.startX;
            const dy = currentPoint.y - this.dragState.startY;

            if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
                this.dragState.moved = true;
            }

            for (const objectId of this.dragState.objectIds || [this.dragState.objectId]) {
                const object = this.findObject(objectId);
                const original = this.dragState.originals && this.dragState.originals[objectId];
                if (!object || !original) {
                    continue;
                }

                if (original.relative) {
                    object.data = {...(object.data || {}), dx: Math.round(original.dx + dx), dy: Math.round(original.dy + dy)};
                } else {
                    const snapped = this.snapPoint({x: original.x + dx, y: original.y + dy});
                    object.data = {...(object.data || {}), x: Math.round(snapped.x), y: Math.round(snapped.y)};
                }
            }
            this.renderCanvas();
        }

        async handlePointerUp(event) {
            if (this.selectionBoxState && event.pointerId === this.selectionBoxState.pointerId) {
                event.preventDefault();
                if (this.svg.releasePointerCapture) {
                    try {
                        this.svg.releasePointerCapture(event.pointerId);
                    } catch (error) {
                        // Pointer capture might already be released by the browser.
                    }
                }
                this.finishSelectionBox();
                return;
            }

            if (!this.dragState || event.pointerId !== this.dragState.pointerId) {
                return;
            }

            event.preventDefault();
            const dragState = this.dragState;
            this.dragState = null;

            if (this.svg.releasePointerCapture) {
                try {
                    this.svg.releasePointerCapture(event.pointerId);
                } catch (error) {
                    // Pointer capture might already be released by the browser.
                }
            }

            if (!dragState.moved) {
                this.ignoreNextCanvasClick = true;
                this.selectObject(dragState.objectId);
                return;
            }

            this.ignoreNextCanvasClick = true;

            const beforeObjects = [];
            const afterObjects = [];

            for (const objectId of dragState.objectIds || [dragState.objectId]) {
                const object = this.findObject(objectId);
                const original = dragState.originals && dragState.originals[objectId];
                if (!object || !original) {
                    continue;
                }

                const beforeObject = this.cloneObject(object);
                beforeObject.data = original.relative
                    ? {...(beforeObject.data || {}), dx: original.dx, dy: original.dy}
                    : {...(beforeObject.data || {}), x: original.x, y: original.y};
                beforeObjects.push(beforeObject);
            }

            try {
                for (const objectId of dragState.objectIds || [dragState.objectId]) {
                    const object = this.findObject(objectId);
                    if (!object) {
                        continue;
                    }
                    const result = await this.request(this.objectDetailUrl(object.object_id), {
                        method: "PATCH",
                        headers: {"Content-Type": "application/json"},
                        body: JSON.stringify({data: object.data}),
                    });
                    Object.assign(object, result.object);
                    afterObjects.push(this.cloneObject(result.object));
                }

                if (beforeObjects.length === 1 && afterObjects.length === 1) {
                    this.pushHistory({kind: "update", before: beforeObjects[0], after: afterObjects[0]});
                } else if (beforeObjects.length > 1) {
                    this.pushHistory({kind: "bulk-update", before: beforeObjects, after: afterObjects});
                }

                this.render();
                this.setStatus("Zapisano nowe pozycje dla " + afterObjects.length + " obiekt" + (afterObjects.length === 1 ? "u." : "ów."));
            } catch (error) {
                for (const beforeObject of beforeObjects) {
                    const object = this.findObject(beforeObject.object_id);
                    if (object) {
                        object.data = this.cloneObject(beforeObject.data || {});
                    }
                }
                this.render();
                this.setStatus("Nie udało się zapisać przesunięcia: " + error.message, true);
            }
        }

        selectObject(objectId) {
            this.setSingleSelection(objectId);
            this.render();
            if (objectId) {
                this.openEditPanel("object");
            }
            this.setStatus("Zaznaczono obiekt " + objectId + ".");
        }

        selectedObjectLabelValue(object) {
            if (!object || !object.data) {
                return "";
            }
            if (isGroup(object)) {
                return object.data.name || "Grupa";
            }
            if (isTextLike(object)) {
                return object.data.text || object.data.label || "";
            }
            return object.data.label || "";
        }

        valueAtObjectPath(object, path) {
            return String(path || "").split(".").filter(Boolean).reduce((value, key) => value == null ? undefined : value[key], object);
        }

        setValueAtObjectPath(target, path, value) {
            const keys = String(path || "").split(".").filter(Boolean);
            if (keys.length === 0) { return; }
            let cursor = target;
            keys.slice(0, -1).forEach((key) => {
                if (!cursor[key] || typeof cursor[key] !== "object") { cursor[key] = {}; }
                cursor = cursor[key];
            });
            cursor[keys[keys.length - 1]] = value;
        }

        parsePluginPropertyValue(input, field) {
            if (field.type === "number" || field.type === "range") {
                return Number(input.value);
            }
            if (field.type === "checkbox") {
                return input.checked;
            }
            return input.value;
        }

        updatePluginPropertiesPanel() {
            if (!this.pluginPropertiesPanel || !this.pluginPropertiesFields) { return; }
            const selected = this.selectedObjects();
            const object = selected.length === 1 ? selected[0] : null;
            const definition = object ? registeredObjectType(object) : null;
            const fields = definition && Array.isArray(definition.propertyFields) ? definition.propertyFields : [];
            if (!object || fields.length === 0) {
                this.pluginPropertiesPanel.hidden = true;
                this.pluginPropertiesFields.innerHTML = "";
                return;
            }
            this.pluginPropertiesPanel.hidden = false;
            if (this.pluginPropertiesTitle) {
                this.pluginPropertiesTitle.textContent = "Właściwości: " + (definition.displayName || object.type);
            }
            this.pluginPropertiesFields.innerHTML = "";
            fields.forEach((field) => {
                const label = document.createElement("label");
                label.className = field.type === "checkbox" ? "drawing-editor__checkbox-field" : "drawing-editor__field";
                const caption = document.createElement("span");
                caption.textContent = field.label;
                label.appendChild(caption);
                const input = document.createElement(field.type === "select" ? "select" : "input");
                input.dataset.pluginPropertyKey = field.key;
                if (field.type !== "select") { input.type = field.type || "text"; }
                ["min", "max", "step", "placeholder"].forEach((attribute) => {
                    if (field[attribute] !== undefined) { input.setAttribute(attribute, String(field[attribute])); }
                });
                if (field.type === "select") {
                    (field.options || []).forEach((optionDefinition) => {
                        const option = document.createElement("option");
                        const normalized = typeof optionDefinition === "object" ? optionDefinition : {value: optionDefinition, label: optionDefinition};
                        option.value = String(normalized.value);
                        option.textContent = String(normalized.label);
                        input.appendChild(option);
                    });
                }
                const value = typeof field.read === "function" ? field.read(object) : this.valueAtObjectPath(object, field.path || ("data." + field.key));
                if (field.type === "checkbox") { input.checked = Boolean(value); }
                else if (value !== undefined && value !== null) { input.value = String(value); }
                label.appendChild(input);
                if (field.help) {
                    const help = document.createElement("small");
                    help.className = "drawing-editor__field-hint";
                    help.textContent = field.help;
                    label.appendChild(help);
                }
                this.pluginPropertiesFields.appendChild(label);
            });
        }

        async applySelectedPluginProperties() {
            const selected = this.selectedObjects();
            if (selected.length !== 1) {
                this.setStatus("Właściwości pluginu można teraz edytować dla jednego zaznaczonego obiektu.", true);
                return;
            }
            const object = selected[0];
            const definition = registeredObjectType(object);
            const fields = definition && Array.isArray(definition.propertyFields) ? definition.propertyFields : [];
            if (fields.length === 0) {
                this.setStatus("Ten typ obiektu nie udostępnia własnych właściwości.", true);
                return;
            }
            const patch = {data: this.cloneObject(object.data || {}), style: this.cloneObject(object.style || {})};
            for (const field of fields) {
                const input = this.pluginPropertiesFields.querySelector("[data-plugin-property-key='" + CSS.escape(field.key) + "']");
                if (!input) { continue; }
                const value = this.parsePluginPropertyValue(input, field);
                const validationError = typeof field.validate === "function" ? field.validate(value, object) : null;
                if (validationError) {
                    this.setStatus(validationError, true);
                    input.focus();
                    return;
                }
                if (typeof field.write === "function") {
                    field.write({patch, value, object, editor: this});
                } else {
                    this.setValueAtObjectPath(patch, field.path || ("data." + field.key), value);
                }
            }
            const finalPatch = typeof definition.buildPropertyPatch === "function"
                ? definition.buildPropertyPatch({object, patch, editor: this})
                : patch;
            try {
                const before = this.cloneObject(object);
                const result = await this.request(this.objectDetailUrl(object.object_id), {
                    method: "PATCH",
                    headers: {"Content-Type": "application/json"},
                    body: JSON.stringify(finalPatch),
                });
                const index = this.objects.findIndex((item) => item.object_id === object.object_id);
                if (index >= 0) { this.objects[index] = result.object; }
                this.pushHistory({kind: "update", before, after: result.object});
                this.render();
                this.setStatus("Zapisano właściwości obiektu „" + (definition.displayName || object.type) + "”.");
            } catch (error) {
                this.setStatus("Nie udało się zapisać właściwości pluginu: " + error.message, true);
            }
        }

        pluginActionContext(actionId) {
            const selected = this.selectedObjects();
            if (selected.length === 0) { return null; }
            const firstObject = selected[0];
            const definition = registeredObjectType(firstObject);
            if (!definition || !Array.isArray(definition.objectActions)) { return null; }
            const action = definition.objectActions.find((item) => item.id === actionId);
            if (!action) { return null; }
            const supportsMultiple = action.supportsMultiple === true;
            const objects = supportsMultiple
                ? selected.filter((object) => object.type === firstObject.type)
                : selected.slice(0, 1);
            if ((!supportsMultiple && selected.length !== 1) || objects.length !== selected.length) { return null; }
            return {selected, objects, object: firstObject, definition, action, supportsMultiple};
        }

        updatePluginActionsPanel() {
            if (!this.pluginActionsPanel || !this.pluginActionButtons) { return; }
            const selected = this.selectedObjects();
            const firstObject = selected[0] || null;
            const definition = firstObject ? registeredObjectType(firstObject) : null;
            const sameType = firstObject && selected.every((object) => object.type === firstObject.type);
            const actions = definition && Array.isArray(definition.objectActions)
                ? definition.objectActions.filter((action) => {
                    if (selected.length > 1 && (action.supportsMultiple !== true || !sameType)) { return false; }
                    const context = {object: firstObject, objects: selected, editor: this};
                    return typeof action.isVisible !== "function" || action.isVisible(context);
                })
                : [];
            if (!firstObject || actions.length === 0) {
                this.pluginActionsPanel.hidden = true;
                this.pluginActionButtons.innerHTML = "";
                return;
            }
            this.pluginActionsPanel.hidden = false;
            if (this.pluginActionsTitle) {
                const suffix = selected.length > 1 ? " (" + selected.length + " obiekty)" : "";
                this.pluginActionsTitle.textContent = "Akcje: " + (definition.displayName || firstObject.type) + suffix;
            }
            this.pluginActionButtons.innerHTML = "";
            actions.forEach((action) => {
                const button = document.createElement("button");
                button.type = "button";
                button.className = action.danger ? "btn btn-danger" : "btn btn-secondary";
                button.dataset.pluginObjectAction = action.id;
                button.textContent = action.label;
                const context = {object: firstObject, objects: selected, editor: this};
                button.disabled = typeof action.isEnabled === "function" && !action.isEnabled(context);
                if (action.title) { button.title = action.title; }
                this.pluginActionButtons.appendChild(button);
            });
        }

        resolvePluginCreationReferences(value, createdByClientId) {
            if (typeof value === "string" && value.startsWith("$created:")) {
                const clientId = value.slice("$created:".length);
                const created = createdByClientId.get(clientId);
                if (!created) {
                    throw new Error("Nie można rozwiązać odwołania do nowego obiektu: " + clientId + ".");
                }
                return created.object_id;
            }
            if (Array.isArray(value)) {
                return value.map((item) => this.resolvePluginCreationReferences(item, createdByClientId));
            }
            if (value && typeof value === "object") {
                return Object.fromEntries(Object.entries(value).map(([key, item]) => [
                    key,
                    this.resolvePluginCreationReferences(item, createdByClientId),
                ]));
            }
            return value;
        }

        pluginCreationReferenceIds(value, result = new Set()) {
            if (typeof value === "string" && value.startsWith("$created:")) {
                const clientId = value.slice("$created:".length).trim();
                if (!clientId) {
                    throw new Error("Odwołanie $created: musi zawierać clientId.");
                }
                result.add(clientId);
                return result;
            }
            if (Array.isArray(value)) {
                value.forEach((item) => this.pluginCreationReferenceIds(item, result));
                return result;
            }
            if (value && typeof value === "object") {
                Object.values(value).forEach((item) => this.pluginCreationReferenceIds(item, result));
            }
            return result;
        }

        orderPluginCreationPayloads(payloads) {
            const nodes = payloads.map((rawPayload, index) => {
                if (!rawPayload || typeof rawPayload !== "object" || !rawPayload.type) {
                    throw new Error("Każdy nowy obiekt musi mieć poprawny typ i dane.");
                }
                const clientId = rawPayload.clientId === undefined ? null : String(rawPayload.clientId).trim();
                if (rawPayload.clientId !== undefined && !clientId) {
                    throw new Error("clientId nowego obiektu nie może być pusty.");
                }
                return {rawPayload, clientId, index, dependencies: this.pluginCreationReferenceIds(rawPayload)};
            });
            const byClientId = new Map();
            nodes.forEach((node) => {
                if (!node.clientId) { return; }
                if (byClientId.has(node.clientId)) {
                    throw new Error("Powtórzony clientId w operacji tworzenia: " + node.clientId + ".");
                }
                byClientId.set(node.clientId, node);
            });
            nodes.forEach((node) => node.dependencies.forEach((dependencyId) => {
                if (!byClientId.has(dependencyId)) {
                    throw new Error("Nieznany clientId w odwołaniu $created: " + dependencyId + ".");
                }
            }));
            const ordered = [];
            const temporary = new Set();
            const permanent = new Set();
            const visit = (node) => {
                if (permanent.has(node)) { return; }
                if (temporary.has(node)) {
                    throw new Error("Wykryto cykl zależności w pakiecie tworzonym przez plugin.");
                }
                temporary.add(node);
                node.dependencies.forEach((dependencyId) => visit(byClientId.get(dependencyId)));
                temporary.delete(node);
                permanent.add(node);
                ordered.push(node.rawPayload);
            };
            [...nodes].sort((a, b) => a.index - b.index).forEach(visit);
            return ordered;
        }

        async createObjectsFromPlugin(payloads, options = {}) {
            const items = Array.isArray(payloads) ? payloads : [];
            if (items.length === 0) {
                throw new Error("Plugin nie przekazał obiektów do utworzenia.");
            }

            // Lokalna analiza daje szybki komunikat o błędzie, ale ostateczne
            // sortowanie, rozwiązywanie $created i atomowość zapewnia backend.
            // Nie jest już potrzebny ręczny rollback częściowo utworzonego obiektu pluginu.
            const orderedItems = this.orderPluginCreationPayloads(items);
            const createdByClientId = new Map();
            void orderedItems;
            void createdByClientId;
            const response = await this.request(this.objectsUrl + "bulk/", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({objects: items}),
            });
            const createdObjects = Array.isArray(response.objects) ? response.objects : [];
            createdObjects.forEach((object) => this.objects.push(object));

            if (options.selectCreated !== false) {
                this.selectedObjectIds = new Set(createdObjects.map((object) => object.object_id));
                this.selectedObjectId = createdObjects.length
                    ? createdObjects[createdObjects.length - 1].object_id
                    : null;
            }
            if (options.pushHistory !== false) {
                this.pushHistory(createdObjects.length === 1
                    ? {kind: "create", object: createdObjects[0]}
                    : {kind: "bulk-create", objects: createdObjects});
            }
            this.render();
            const message = typeof options.successMessage === "function"
                ? options.successMessage(createdObjects)
                : options.successMessage;
            if (message) { this.setStatus(message); }
            return createdObjects;
        }

        async runSelectedPluginAction(actionId) {
            const context = this.pluginActionContext(actionId);
            if (!context) {
                this.setStatus("Ta akcja nie jest dostępna dla bieżącego zaznaczenia.", true);
                return;
            }
            const {object, objects, action, supportsMultiple} = context;
            const actionContext = {object, objects, editor: this};
            if (typeof action.isEnabled === "function" && !action.isEnabled(actionContext)) {
                this.setStatus("Ta akcja nie jest obecnie dostępna.", true);
                return;
            }
            if (action.confirmMessage && !window.confirm(action.confirmMessage)) { return; }
            try {
                if (supportsMultiple && typeof action.runSelection === "function") {
                    const handled = await action.runSelection({
                        objects,
                        editor: this,
                        request: (...args) => this.request(...args),
                        applyToSelection: (...args) => this.applyToSelection(...args),
                        createObjects: (payloads, options = {}) => this.createObjectsFromPlugin(payloads, options),
                        setStatus: (message, isError = false) => this.setStatus(message, isError),
                    });
                    if (handled === false) { return; }
                    this.render();
                    return;
                }
                if (!supportsMultiple && typeof action.run === "function") {
                    const handled = await action.run({
                        object,
                        editor: this,
                        request: (...args) => this.request(...args),
                        createObjects: (payloads, options = {}) => this.createObjectsFromPlugin(payloads, options),
                        setStatus: (message, isError = false) => this.setStatus(message, isError),
                    });
                    if (handled === false) { return; }
                    this.render();
                    return;
                }
                // Zgodność z kontraktem akcji jednoobiektowej: action.buildPatch({object, editor: this})
                const targets = supportsMultiple ? objects : [object];
                const result = await this.applyToSelection(async (target) => {
                    const patch = action.buildPatch({object: target, objects: targets, editor: this});
                    if (!patch || typeof patch !== "object") {
                        throw new Error("Akcja nie zwróciła poprawnej aktualizacji obiektu.");
                    }
                    const response = await this.request(this.objectDetailUrl(target.object_id), {
                        method: "PATCH",
                        headers: {"Content-Type": "application/json"},
                        body: JSON.stringify(patch),
                    });
                    return response.object;
                }, {
                    objects: targets,
                    successMessage: action.successMessage || ((updated) => "Wykonano akcję „" + action.label + "” dla " + updated.length + " obiektów."),
                    errorMessage: "Nie udało się wykonać akcji pluginu",
                });
                if (result.error) { return; }
            } catch (error) {
                this.setStatus("Nie udało się wykonać akcji pluginu: " + error.message, true);
            }
        }

        updateContentPanel() {
            if (!this.contentPanel) {
                return;
            }

            const object = this.findObject(this.selectedObjectId);
            if (!object) {
                this.contentPanel.classList.add("drawing-editor__content-panel--disabled");
                this.contentPanel.querySelectorAll("input, select, textarea, button").forEach((input) => {
                    input.disabled = true;
                });
                if (this.contentLabelInput) {
                    this.contentLabelInput.value = "";
                }
                return;
            }

            this.contentPanel.classList.remove("drawing-editor__content-panel--disabled");
            this.contentPanel.querySelectorAll("input, select, textarea, button").forEach((input) => {
                input.disabled = false;
            });
            if (this.contentLabelInput) {
                this.contentLabelInput.value = this.selectedObjectLabelValue(object);
            }
        }

        async applySelectedContent() {
            const objects = this.selectedObjects();
            if (objects.length === 0) {
                this.setStatus("Najpierw zaznacz obiekt lub obiekty, których treść chcesz zmienić.", true);
                return;
            }
            const value = this.contentLabelInput ? this.contentLabelInput.value.trim() : "";
            await this.applyToSelection(async (object) => {
                const newData = {...(object.data || {})};
                if (isGroup(object)) {
                    newData.name = value || "Grupa";
                } else if (isTextLike(object)) {
                    newData.text = value || "x";
                    newData.label = "";
                } else {
                    newData.label = value;
                }
                const result = await this.request(this.objectDetailUrl(object.object_id), {
                    method: "PATCH",
                    headers: {"Content-Type": "application/json"},
                    body: JSON.stringify({data: newData}),
                });
                return result.object;
            }, {
                objects,
                emptyMessage: "Najpierw zaznacz obiekt lub obiekty, których treść chcesz zmienić.",
                successMessage: (updated) => "Zapisano treść dla " + updated.length + " obiekt" + (updated.length === 1 ? "u." : "ów."),
                errorMessage: "Nie udało się zapisać treści zaznaczenia",
            });
        }

        updateStylePanel() {
            if (!this.stylePanel) {
                return;
            }

            const object = this.findObject(this.selectedObjectId);
            if (!object) {
                this.stylePanel.classList.add("drawing-editor__style-panel--disabled");
                this.stylePanel.querySelectorAll("input, select, textarea, button").forEach((input) => {
                    input.disabled = true;
                });
                this.updateVisibleStyleFields(null);
                return;
            }

            this.updateVisibleStyleFields(object);
            const style = object.style || {};
            this.stylePanel.classList.remove("drawing-editor__style-panel--disabled");
            this.stylePanel.querySelectorAll("input, select, textarea, button").forEach((input) => {
                input.disabled = false;
            });

            if (this.styleStrokeInput) {
                this.styleStrokeInput.value = style.stroke || "#111827";
            }
            if (this.styleFillInput) {
                this.styleFillInput.value = style.fill || (object.type === "graph.vertex" ? "#ffffff" : "#111827");
            }
            if (this.styleStrokeWidthInput) {
                this.styleStrokeWidthInput.value = String(strokeWidth(object));
            }
            if (this.styleLineDashInput) {
                this.styleLineDashInput.value = style.lineDash || "solid";
            }
            if (this.styleStrokeOpacityInput) {
                this.styleStrokeOpacityInput.value = String(opacityValue(style.strokeOpacity, 1));
            }
            if (this.styleFillOpacityInput) {
                this.styleFillOpacityInput.value = String(opacityValue(style.fillOpacity, 1));
            }
            if (this.styleFontSizeInput) {
                this.styleFontSizeInput.value = String(fontSize(object, isTextLike(object) ? 18 : 14));
            }
            if (this.styleLabelPositionInput) {
                this.styleLabelPositionInput.value = labelPosition(object, isLineLike(object) ? "above" : "above-right");
            }
            if (this.styleRadiusInput) {
                this.styleRadiusInput.value = String(pointRadius(object));
                this.styleRadiusInput.disabled = !isPointLike(object);
            }
            if (this.styleVisibleInput) {
                this.styleVisibleInput.checked = objectIsVisible(object);
            }
            if (this.styleShowLabelInput) {
                this.styleShowLabelInput.checked = shouldShowLabel(object);
            }
            if (this.styleDirectedInput) {
                this.styleDirectedInput.checked = object.type === "graph.edge" && object.style && object.style.directed === true;
                this.styleDirectedInput.disabled = object.type !== "graph.edge";
            }
        }

        async applySelectedStyle() {
            const activeObject = this.findObject(this.selectedObjectId);
            const objects = this.selectedObjects();
            if (!activeObject || objects.length === 0) {
                this.setStatus("Najpierw zaznacz obiekt lub obiekty, których styl chcesz zmienić.", true);
                return;
            }

            const sharedStyle = {
                stroke: this.styleStrokeInput ? this.styleStrokeInput.value : "#111827",
                fill: this.styleFillInput ? this.styleFillInput.value : "#111827",
                strokeWidth: this.styleStrokeWidthInput ? Number(this.styleStrokeWidthInput.value) : strokeWidth(activeObject),
                lineDash: this.styleLineDashInput ? this.styleLineDashInput.value : (activeObject.style && activeObject.style.lineDash) || "solid",
                strokeOpacity: this.styleStrokeOpacityInput ? opacityValue(this.styleStrokeOpacityInput.value, 1) : opacityValue(activeObject.style && activeObject.style.strokeOpacity, 1),
                fillOpacity: this.styleFillOpacityInput ? opacityValue(this.styleFillOpacityInput.value, 1) : opacityValue(activeObject.style && activeObject.style.fillOpacity, 1),
                fontSize: this.styleFontSizeInput ? Number(this.styleFontSizeInput.value) : fontSize(activeObject, isTextLike(activeObject) ? 18 : 14),
                labelPosition: this.styleLabelPositionInput ? this.styleLabelPositionInput.value : labelPosition(activeObject),
                visible: this.styleVisibleInput ? this.styleVisibleInput.checked : objectIsVisible(activeObject),
                showLabel: this.styleShowLabelInput ? this.styleShowLabelInput.checked : true,
            };

            await this.applyToSelection(async (object) => {
                const newStyle = {...(object.style || {}), ...sharedStyle};
                if (object.type === "graph.edge") {
                    newStyle.directed = this.styleDirectedInput ? this.styleDirectedInput.checked : object.style && object.style.directed === true;
                } else {
                    delete newStyle.directed;
                }
                if (isPointLike(object)) {
                    newStyle.radius = this.styleRadiusInput ? Number(this.styleRadiusInput.value) : pointRadius(object);
                } else {
                    delete newStyle.radius;
                }
                const result = await this.request(this.objectDetailUrl(object.object_id), {
                    method: "PATCH",
                    headers: {"Content-Type": "application/json"},
                    body: JSON.stringify({style: newStyle}),
                });
                return result.object;
            }, {
                objects,
                emptyMessage: "Najpierw zaznacz obiekt lub obiekty, których styl chcesz zmienić.",
                successMessage: (updated) => "Zapisano styl dla " + updated.length + " obiekt" + (updated.length === 1 ? "u." : "ów."),
                errorMessage: "Nie udało się zapisać stylu zaznaczenia",
            });
        }


        exportFileName(extension) {
            const rawTitle = (this.root.dataset.drawingTitle || "rysunek").toString();
            const safeTitle = rawTitle
                .trim()
                .toLowerCase()
                .replace(/[^a-z0-9ąćęłńóśżź_-]+/gi, "-")
                .replace(/-+/g, "-")
                .replace(/^-|-$/g, "") || "rysunek";
            return safeTitle + "." + extension;
        }

        svgExportStyles() {
            return `
                .drawing-editor__grid-line { stroke: #e5e7eb; stroke-width: 1; }
                .drawing-object { cursor: default; }
                .drawing-object--selected { stroke-width: 3px; }
                .drawing-line { fill: none; }
                .drawing-line-hit { fill: none; stroke: transparent; stroke-width: 14; }
                .drawing-polygon-hit { fill: transparent; stroke: transparent; stroke-width: 14; }
                .drawing-label { font-family: Arial, sans-serif; font-size: 14px; fill: #111827; }
                .drawing-plot { font-family: Arial, sans-serif; }
            `;
        }

        serializedSvgForDownload() {
            if (!this.svg) {
                throw new Error("Nie znaleziono canvasa SVG.");
            }
            this.renderCanvas();
            const clone = this.svg.cloneNode(true);
            clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
            clone.setAttribute("version", "1.1");
            clone.removeAttribute("role");
            clone.removeAttribute("aria-label");
            clone.querySelectorAll(".drawing-line-hit, .drawing-polygon-hit").forEach((element) => element.remove());
            clone.querySelectorAll(".drawing-object--selected, .drawing-label--selected").forEach((element) => {
                element.classList.remove("drawing-object--selected");
                element.classList.remove("drawing-label--selected");
            });
            const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
            style.textContent = this.svgExportStyles();
            clone.insertBefore(style, clone.firstChild);
            const width = this.drawingSettings.canvas.width;
            const height = this.drawingSettings.canvas.height;
            clone.setAttribute("width", String(width));
            clone.setAttribute("height", String(height));
            clone.setAttribute("viewBox", `0 0 ${width} ${height}`);
            return '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(clone);
        }

        triggerTextDownload(content, filename, mimeType) {
            const blob = new Blob([content], {type: mimeType});
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        }

        downloadSvg() {
            try {
                const svgText = this.serializedSvgForDownload();
                this.triggerTextDownload(svgText, this.exportFileName("svg"), "image/svg+xml;charset=utf-8");
                this.setStatus("Pobrano rysunek jako SVG.");
            } catch (error) {
                this.setStatus("Nie udało się pobrać SVG: " + error.message, true);
            }
        }

        async downloadPng() {
            try {
                const svgText = this.serializedSvgForDownload();
                const svgBlob = new Blob([svgText], {type: "image/svg+xml;charset=utf-8"});
                const url = URL.createObjectURL(svgBlob);
                const image = new Image();
                const width = this.drawingSettings.canvas.width;
                const height = this.drawingSettings.canvas.height;
                image.width = width;
                image.height = height;
                const loaded = new Promise((resolve, reject) => {
                    image.onload = resolve;
                    image.onerror = () => reject(new Error("Nie udało się przekonwertować SVG do PNG."));
                });
                image.src = url;
                await loaded;
                const canvas = document.createElement("canvas");
                canvas.width = width;
                canvas.height = height;
                const context = canvas.getContext("2d");
                context.fillStyle = "#ffffff";
                context.fillRect(0, 0, width, height);
                context.drawImage(image, 0, 0, width, height);
                URL.revokeObjectURL(url);
                canvas.toBlob((blob) => {
                    if (!blob) {
                        this.setStatus("Nie udało się utworzyć pliku PNG.", true);
                        return;
                    }
                    const pngUrl = URL.createObjectURL(blob);
                    const link = document.createElement("a");
                    link.href = pngUrl;
                    link.download = this.exportFileName("png");
                    document.body.appendChild(link);
                    link.click();
                    link.remove();
                    window.setTimeout(() => URL.revokeObjectURL(pngUrl), 1000);
                    this.setStatus("Pobrano rysunek jako PNG.");
                }, "image/png");
            } catch (error) {
                this.setStatus("Nie udało się pobrać PNG: " + error.message, true);
            }
        }

        async previewTikz() {
            if (!this.tikzPreviewUrl || !this.tikzPreviewTextarea) {
                this.setStatus("Brakuje konfiguracji endpointu podglądu TikZ.", true);
                return;
            }

            try {
                const payload = await this.request(this.tikzPreviewUrl);
                this.tikzPreviewTextarea.value = payload.tikz || "";
                if (this.tikzPreviewPanel) {
                    this.tikzPreviewPanel.hidden = false;
                }
                if (this.tikzPreviewStatus) {
                    this.tikzPreviewStatus.textContent = "Wygenerowano podgląd kodu TikZ.";
                }
                if (this.copyTikzButton) {
                    this.copyTikzButton.disabled = !this.tikzPreviewTextarea.value;
                }
                this.setStatus("Wygenerowano podgląd kodu TikZ.");
            } catch (error) {
                if (this.tikzPreviewStatus) {
                    this.tikzPreviewStatus.textContent = "Nie udało się wygenerować podglądu.";
                }
                this.setStatus("Nie udało się wygenerować podglądu TikZ: " + error.message, true);
            }
        }

        async copyTikzToClipboard() {
            if (!this.tikzPreviewTextarea || !this.tikzPreviewTextarea.value) {
                this.setStatus("Najpierw wygeneruj podgląd kodu TikZ.", true);
                return;
            }

            const tikzCode = this.tikzPreviewTextarea.value;

            try {
                if (navigator.clipboard && window.isSecureContext) {
                    await navigator.clipboard.writeText(tikzCode);
                } else {
                    this.tikzPreviewTextarea.focus();
                    this.tikzPreviewTextarea.select();
                    document.execCommand("copy");
                }
                if (this.tikzPreviewStatus) {
                    this.tikzPreviewStatus.textContent = "Skopiowano kod TikZ do schowka.";
                }
                this.setStatus("Skopiowano kod TikZ do schowka.");
            } catch (error) {
                this.setStatus("Nie udało się skopiować kodu TikZ: " + error.message, true);
            }
        }


        sortedObjects() {
            return this.flattenObjects().sort((a, b) => {
                const orderA = Number.isFinite(Number(a.order)) ? Number(a.order) : 0;
                const orderB = Number.isFinite(Number(b.order)) ? Number(b.order) : 0;
                if (orderA !== orderB) {
                    return orderA - orderB;
                }
                return Number(a.id || 0) - Number(b.id || 0);
            });
        }

        renderingLayer(object) {
            // Krok 23: obiekty zależne, takie jak odcinki, okręgi i wielokąty,
            // rysujemy przed punktami. Dzięki temu automatycznie utworzone
            // punkty sterujące pozostają widoczne i klikalne po utworzeniu figury.
            if (isPolygonLike(object) || isCircleLike(object) || isLineLike(object)) {
                return 0;
            }
            if (isPointLike(object)) {
                return 1;
            }
            if (isRelativeLabel(object) || isTextLike(object)) {
                return 2;
            }
            return 3;
        }

        sortedObjectsForRendering() {
            return this.sortedObjects().sort((a, b) => {
                const layerA = this.renderingLayer(a);
                const layerB = this.renderingLayer(b);
                if (layerA !== layerB) {
                    return layerA - layerB;
                }
                const orderA = Number.isFinite(Number(a.order)) ? Number(a.order) : 0;
                const orderB = Number.isFinite(Number(b.order)) ? Number(b.order) : 0;
                if (orderA !== orderB) {
                    return orderA - orderB;
                }
                return Number(a.id || 0) - Number(b.id || 0);
            });
        }

        switchToSelectAfterGeometryCreation(objectType) {
            // Po utworzeniu obiektu geometrycznego przełączamy edytor na zaznaczanie,
            // żeby użytkownik mógł od razu przesunąć punkty sterujące figury.
            if (objectType === "geometry.segment" || objectType === "geometry.circle" || objectType === "geometry.polygon") {
                this.setToolType("select");
            }
        }

        renumberOrderedObjects(orderedObjects) {
            return orderedObjects.map((object, index) => ({
                ...object,
                order: index,
            }));
        }

        reorderedObjectList(direction) {
            const ordered = this.sortedObjects();
            const selectedIds = new Set(this.selectedIds());
            const selected = ordered.filter((object) => selectedIds.has(object.object_id));
            const unselected = ordered.filter((object) => !selectedIds.has(object.object_id));

            if (selected.length === 0) {
                return ordered;
            }

            if (direction === "front") {
                return this.renumberOrderedObjects([...unselected, ...selected]);
            }

            if (direction === "back") {
                return this.renumberOrderedObjects([...selected, ...unselected]);
            }

            const result = [...ordered];
            if (direction === "up") {
                for (let i = result.length - 2; i >= 0; i -= 1) {
                    if (selectedIds.has(result[i].object_id) && !selectedIds.has(result[i + 1].object_id)) {
                        const current = result[i];
                        result[i] = result[i + 1];
                        result[i + 1] = current;
                    }
                }
                return this.renumberOrderedObjects(result);
            }

            if (direction === "down") {
                for (let i = 1; i < result.length; i += 1) {
                    if (selectedIds.has(result[i].object_id) && !selectedIds.has(result[i - 1].object_id)) {
                        const current = result[i];
                        result[i] = result[i - 1];
                        result[i - 1] = current;
                    }
                }
                return this.renumberOrderedObjects(result);
            }

            return ordered;
        }

        async reorderSelectedObjects(direction) {
            const selected = this.selectedObjects();
            if (selected.length === 0) {
                this.setStatus("Najpierw zaznacz obiekt lub obiekty, których kolejność chcesz zmienić.", true);
                return;
            }

            const beforeObjects = this.sortedObjects().map((object) => this.cloneObject(object));
            const reordered = this.reorderedObjectList(direction);
            const beforeById = new Map(beforeObjects.map((object) => [object.object_id, object]));
            const changed = reordered.filter((object) => {
                const before = beforeById.get(object.object_id);
                return before && Number(before.order) !== Number(object.order);
            });

            if (changed.length === 0) {
                this.setStatus("Kolejność zaznaczonych obiektów nie wymaga zmiany.");
                return;
            }

            try {
                const afterObjects = [];
                for (const object of changed) {
                    const result = await this.request(this.objectDetailUrl(object.object_id), {
                        method: "PATCH",
                        headers: {"Content-Type": "application/json"},
                        body: JSON.stringify({order: object.order}),
                    });
                    this.replaceObjectInMemory(result.object);
                    afterObjects.push(this.cloneObject(result.object));
                }

                const beforeChanged = changed
                    .map((object) => beforeById.get(object.object_id))
                    .filter(Boolean)
                    .map((object) => this.cloneObject(object));

                this.pushHistory({kind: "bulk-update", before: beforeChanged, after: afterObjects});
                this.render();

                const labels = {
                    front: "Przeniesiono zaznaczone obiekty na wierzch.",
                    back: "Przeniesiono zaznaczone obiekty pod spód.",
                    up: "Przeniesiono zaznaczone obiekty jedną warstwę wyżej.",
                    down: "Przeniesiono zaznaczone obiekty jedną warstwę niżej.",
                };
                this.setStatus(labels[direction] || "Zmieniono kolejność obiektów.");
            } catch (error) {
                for (const before of beforeObjects) {
                    this.replaceObjectInMemory(before);
                }
                this.render();
                this.setStatus("Nie udało się zmienić kolejności obiektów: " + error.message, true);
            }
        }

        remapDependencyData(object, idMap) {
            const data = this.cloneObject(object.data || {});
            const fieldsByType = {
                "graph.edge": ["source", "target"],
                "geometry.segment": ["source", "target"],
                "geometry.midpoint": ["source", "target"],
                "geometry.line_intersection": ["a1", "a2", "b1", "b2"],
                "geometry.perpendicular_projection": ["point", "lineA", "lineB"],
                "geometry.segment_projection": ["point", "segmentA", "segmentB"],
                "geometry.circle_nearest_point": ["point", "center", "radiusPoint"],
                "geometry.line_circle_intersection": ["lineA", "lineB", "center", "radiusPoint"],
                "geometry.circle_circle_intersection": ["centerA", "radiusPointA", "centerB", "radiusPointB"],
                "geometry.circumcenter": ["pointA", "pointB", "pointC"],
                "geometry.orthocenter": ["pointA", "pointB", "pointC"],
                "geometry.nine_point_center": ["pointA", "pointB", "pointC"],
                "geometry.centroid": ["pointA", "pointB", "pointC"],
                "geometry.incenter": ["pointA", "pointB", "pointC"],
                "geometry.excenter": ["pointA", "pointB", "pointC"],
                "geometry.excircle_touchpoint": ["pointA", "pointB", "pointC"],
                "geometry.incircle_touchpoint": ["pointA", "pointB", "pointC"],
                "geometry.reflection_across_line": ["point", "lineA", "lineB"],
                "geometry.rotation_around_point": ["point", "center"],
                "geometry.central_reflection": ["point", "center"],
                "geometry.homothety": ["point", "center"],
                "geometry.translation_by_vector": ["point", "vectorStart", "vectorEnd"],
                "geometry.circle": ["center", "point"],
                "geometry.polygon": ["points"],
                "label.relative": ["baseObjectId"],
            };
            const definition = registeredObjectType(object);
            const dependencyFields = definition && Array.isArray(definition.dependencyFields)
                ? definition.dependencyFields
                : (fieldsByType[object.type] || []);
            for (const field of dependencyFields) {
                if (Array.isArray(data[field])) {
                    data[field] = data[field].map((id) => idMap.get(id) || id);
                } else if (typeof data[field] === "string") {
                    data[field] = idMap.get(data[field]) || data[field];
                }
            }
            return data;
        }

        duplicationOrder(objects) {
            const selectedIds = new Set(objects.map((object) => object.object_id));
            const pending = [...objects];
            const ordered = [];
            const emitted = new Set();
            while (pending.length) {
                const ready = pending.filter((object) =>
                    this.dependencyIds(object).every((id) => !selectedIds.has(id) || emitted.has(id))
                );
                if (!ready.length) {
                    ordered.push(...pending);
                    break;
                }
                for (const object of ready) {
                    ordered.push(object);
                    emitted.add(object.object_id);
                    pending.splice(pending.indexOf(object), 1);
                }
            }
            return ordered;
        }

        duplicatePayloadForObject(object, idMap = new Map(), selectedIds = new Set()) {
            const data = this.remapDependencyData(object, idMap);
            const style = this.cloneObject(object.style || {});

            if (isRelativeLabel(object)) {
                const baseId = (object.data || {}).baseObjectId;
                // Gdy baza też jest kopiowana, jej przesunięcie wystarczy; zachowujemy offset.
                // Przy kopiowaniu samej etykiety przesuwamy ją względem oryginalnej bazy.
                if (!selectedIds.has(baseId)) {
                    data.dx = Number(data.dx || 0) + 28;
                    data.dy = Number(data.dy || 0) + 28;
                }
            } else if (isPositionedObject(object)) {
                const x = Number(data.x);
                const y = Number(data.y);
                const snapped = this.snapPoint({
                    x: Number.isFinite(x) ? x + 28 : 28,
                    y: Number.isFinite(y) ? y + 28 : 28,
                });
                data.x = Math.round(snapped.x);
                data.y = Math.round(snapped.y);
            }

            return {
                type: object.type,
                data: data,
                style: style,
                order: Number.isFinite(Number(object.order)) ? Number(object.order) + 1 : 0,
            };
        }

        async groupSelectedObjects() {
            const selected = this.selectedObjects();
            const roots = selected.filter((object) => !this.objectTreeEntries().find((entry) => entry.object.object_id === object.object_id)?.parent);
            if (roots.length < 2) {
                this.setStatus("Zaznacz co najmniej dwa obiekty najwyższego poziomu, aby utworzyć grupę.", true);
                return;
            }
            try {
                const result = await this.request(this.objectsUrl, {
                    method: "POST",
                    headers: {"Content-Type": "application/json"},
                    body: JSON.stringify({
                        type: "group",
                        data: {name: "Grupa", childObjectIds: roots.map((object) => object.object_id)},
                        style: {visible: true},
                    }),
                });
                this.objects.push(result.object);
                this.setSingleSelection(result.object.object_id);
                this.pushHistory({kind: "create", object: result.object});
                this.render();
                this.setStatus("Utworzono grupę z " + roots.length + " obiektów.");
            } catch (error) {
                this.setStatus("Nie udało się utworzyć grupy: " + error.message, true);
            }
        }

        async ungroupSelectedObjects() {
            const groups = this.selectedObjects().filter(isGroup);
            if (groups.length === 0) {
                this.setStatus("Zaznacz co najmniej jedną grupę do rozgrupowania.", true);
                return;
            }
            const children = [];
            try {
                for (const group of groups) {
                    children.push(...this.childObjects(group));
                    await this.request(this.objectDetailUrl(group.object_id), {method: "DELETE"});
                    this.objects = this.objects.filter((object) => object.object_id !== group.object_id);
                }
                this.selectedObjectIds = new Set(children.map((object) => object.object_id));
                this.selectedObjectId = children.length ? children[children.length - 1].object_id : null;
                if (groups.length === 1) {
                    this.pushHistory({kind: "delete", object: groups[0]});
                } else {
                    this.pushHistory({kind: "bulk-delete", objects: groups});
                }
                this.render();
                this.setStatus("Rozgrupowano " + groups.length + " grup" + (groups.length === 1 ? "ę." : "."));
            } catch (error) {
                this.setStatus("Nie udało się rozgrupować: " + error.message, true);
            }
        }

        async duplicateSelectedObject() {
            const objects = this.selectedObjects();
            if (objects.length === 0) {
                this.setStatus("Najpierw zaznacz obiekt lub obiekty do zduplikowania.", true);
                return;
            }

            const createdObjects = [];
            const idMap = new Map();
            const selectedIds = new Set(objects.map((object) => object.object_id));
            const orderedObjects = this.duplicationOrder(objects);
            try {
                for (const object of orderedObjects) {
                    const result = await this.request(this.objectsUrl, {
                        method: "POST",
                        headers: {"Content-Type": "application/json"},
                        body: JSON.stringify(this.duplicatePayloadForObject(object, idMap, selectedIds)),
                    });
                    this.objects.push(result.object);
                    createdObjects.push(result.object);
                    idMap.set(object.object_id, result.object.object_id);
                }

                this.selectedObjectIds = new Set(createdObjects.map((object) => object.object_id));
                this.selectedObjectId = createdObjects.length ? createdObjects[createdObjects.length - 1].object_id : null;
                this.pendingLineStartId = null;

                if (createdObjects.length === 1) {
                    this.pushHistory({kind: "create", object: createdObjects[0]});
                } else {
                    this.pushHistory({kind: "bulk-create", objects: createdObjects});
                }

                this.render();
                this.setStatus("Zduplikowano " + createdObjects.length + " obiekt" + (createdObjects.length === 1 ? "." : "ów.") + " Zależności zostały przepisane na kopie.");
            } catch (error) {
                // Operacja ma być atomowa z perspektywy użytkownika: usuwamy częściowe kopie.
                for (const created of [...createdObjects].reverse()) {
                    try {
                        await this.request(this.objectDetailUrl(created.object_id), {method: "DELETE"});
                    } catch (cleanupError) {
                        console.error("Nie udało się posprzątać częściowej kopii", cleanupError);
                    }
                    this.removeObjectFromMemory(created.object_id);
                }
                this.render();
                this.setStatus("Nie udało się zduplikować obiektów: " + error.message, true);
            }
        }

        async deleteSelectedObject() {
            const selectedObjects = this.expandGroups(this.selectedObjects(), true);
            if (selectedObjects.length === 0) {
                this.setStatus("Najpierw zaznacz obiekt lub obiekty do usunięcia.", true);
                return;
            }

            // Zachowujemy migawkę całego domknięcia zależności przed usunięciem.
            // Backend usuwa obiekty zależne kaskadowo, dlatego nie trzeba ustalać
            // osobnej kolejności usuwania po stronie przeglądarki.
            const selectedIds = selectedObjects.map((object) => object.object_id);
            const closureIds = this.dependencyClosureIds(selectedIds);
            const deletedObjects = this.flattenObjects()
                .filter((object) => closureIds.has(object.object_id))
                .map((object) => this.cloneObject(object));

            try {
                const alreadyDeleted = new Set();

                for (const object of selectedObjects) {
                    if (alreadyDeleted.has(object.object_id)) {
                        continue;
                    }

                    try {
                        const result = await this.request(this.objectDetailUrl(object.object_id), {
                            method: "DELETE",
                        });
                        const removedIds = Array.isArray(result.deleted_object_ids)
                            ? result.deleted_object_ids
                            : [object.object_id];
                        removedIds.forEach((id) => alreadyDeleted.add(id));
                    } catch (error) {
                        // Gdy dwa zaznaczone obiekty są zależne, pierwszy DELETE mógł
                        // już kaskadowo usunąć drugi. Wtedy 404 nie oznacza awarii.
                        if (!String(error.message || error).includes("404")) {
                            throw error;
                        }
                        alreadyDeleted.add(object.object_id);
                    }
                }

                // Serwer jest źródłem prawdy po usuwaniu kaskadowym.
                const payload = await this.request(this.objectsUrl);
                this.objects = payload.objects || [];
                this.selectedObjectIds = new Set();
                this.selectedObjectId = null;
                this.pendingLineStartId = null;
                this.pendingPolygonPointIds = (this.pendingPolygonPointIds || [])
                    .filter((id) => this.findObject(id));
                this.updatePolygonButtons();

                if (deletedObjects.length === 1) {
                    this.pushHistory({kind: "delete", object: deletedObjects[0]});
                } else if (deletedObjects.length > 1) {
                    this.pushHistory({kind: "bulk-delete", objects: deletedObjects});
                }

                this.render();
                const removedCount = deletedObjects.length || alreadyDeleted.size;
                this.setStatus("Usunięto " + removedCount + " obiekt" + (removedCount === 1 ? "." : "ów."));
            } catch (error) {
                try {
                    const payload = await this.request(this.objectsUrl);
                    this.objects = payload.objects || [];
                    this.selectedObjectIds = new Set();
                    this.selectedObjectId = null;
                    this.render();
                } catch (reloadError) {
                    console.error("Nie udało się ponownie wczytać obiektów", reloadError);
                }
                this.setStatus("Nie udało się usunąć obiektów: " + error.message, true);
            }
        }

        render() {
            this.renderCanvas();
            this.renderObjectList();
            this.updateContentPanel();
            this.updateStylePanel();
            this.updatePluginPropertiesPanel();
            this.updatePluginActionsPanel();
            this.updatePlotPanelFromSelection();
            if (this.objectCount) {
                this.objectCount.textContent = String(this.flattenObjects().length);
            }
            if (this.selectionCount) {
                this.selectionCount.textContent = "Zaznaczono: " + this.selectedObjectIds.size;
            }
            this.updateHistoryButtons();
        }

        renderCanvas() {
            const existingObjects = this.svg.querySelectorAll(".drawing-object, .drawing-label, .drawing-line, .drawing-line-hit, .drawing-polygon, .drawing-polygon-hit, .drawing-plot");
            existingObjects.forEach((element) => element.remove());
            this.renderGrid();

            for (const object of this.sortedObjectsForRendering()) {
                if (!objectIsVisible(object) || isGroup(object)) {
                    continue;
                }
                const pluginDefinition = registeredObjectType(object);
                if (pluginDefinition && typeof pluginDefinition.render === "function") {
                    const renderObject = pluginDefinition.pointLike
                        ? {
                            ...object,
                            style: {
                                ...(object.style || {}),
                                fill: "#9ca3af",
                                stroke: "#4b5563",
                            },
                        }
                        : object;
                    const handled = pluginDefinition.render({
                        object: renderObject,
                        editor: this,
                        svg: this.svg,
                        document,
                        resolvePosition: (candidate) => this.resolveObjectPosition(candidate),
                        isSelected: (objectId) => this.isSelected(objectId),
                        bindPointerDown: (element, objectId = object.object_id) => {
                            element.setAttribute("data-object-id", objectId);
                            element.classList.add("drawing-object");
                            element.addEventListener("pointerdown", (event) => this.handleObjectPointerDown(event, objectId));
                        },
                    });
                    if (handled !== false) { continue; }
                }
                if (isPlotSeriesLike(object)) {
                    this.renderPlotSeries(object);
                } else if (isPolygonLike(object)) {
                    this.renderPolygon(object);
                } else if (isCircleLike(object)) {
                    this.renderCircle(object);
                } else if (isLineLike(object)) {
                    this.renderLine(object);
                } else if (isDerivedPoint(object)) {
                    this.renderMidpoint(object);
                } else if (isPointLike(object)) {
                    this.renderPoint(object);
                } else if (isRelativeLabel(object)) {
                    this.renderRelativeLabel(object);
                } else if (isTextLike(object)) {
                    this.renderLatexText(object);
                }
            }
        }

        numericPlotPointsFromObject(object) {
            const collected = [];
            if (!object || !object.data) {
                return collected;
            }
            if (object.type === "plot.chart") {
                const seriesList = Array.isArray(object.data.series) ? object.data.series : [];
                for (const series of seriesList) {
                    const points = Array.isArray(series.points) ? series.points : [];
                    for (const pair of points) {
                        const x = Number(pair[0]);
                        const y = Number(pair[1]);
                        if (Number.isFinite(x) && Number.isFinite(y)) {
                            collected.push({x, y});
                        }
                    }
                }
                const functions = Array.isArray(object.data.functions) ? object.data.functions : [];
                for (const fn of functions) {
                    const min = Number.isFinite(Number(fn.domainMin)) ? Number(fn.domainMin) : -5;
                    const max = Number.isFinite(Number(fn.domainMax)) ? Number(fn.domainMax) : 5;
                    collected.push({x: min, y: 0}, {x: max, y: 0});
                }
                return collected;
            }
            const points = Array.isArray(object.data.points) ? object.data.points : [];
            for (const pair of points) {
                const x = Number(pair[0]);
                const y = Number(pair[1]);
                if (Number.isFinite(x) && Number.isFinite(y)) {
                    collected.push({x, y});
                }
            }
            return collected;
        }

        plotSeriesDataBounds(seriesObject = null) {
            const allPoints = [];
            const sourceObjects = seriesObject ? [seriesObject] : this.flattenObjects().filter((object) => isPlotSeriesLike(object));
            for (const object of sourceObjects) {
                allPoints.push(...this.numericPlotPointsFromObject(object));
            }
            if (allPoints.length === 0) {
                return {minX: 0, maxX: 1, minY: 0, maxY: 1};
            }
            let minX = Math.min(...allPoints.map((point) => point.x));
            let maxX = Math.max(...allPoints.map((point) => point.x));
            let minY = Math.min(...allPoints.map((point) => point.y));
            let maxY = Math.max(...allPoints.map((point) => point.y));

            const axis = seriesObject && seriesObject.data && seriesObject.data.axis ? seriesObject.data.axis : {};
            if (Number.isFinite(Number(axis.xMin))) { minX = Number(axis.xMin); }
            if (Number.isFinite(Number(axis.xMax))) { maxX = Number(axis.xMax); }
            if (Number.isFinite(Number(axis.yMin))) { minY = Number(axis.yMin); }
            if (Number.isFinite(Number(axis.yMax))) { maxY = Number(axis.yMax); }

            if (minX === maxX) { minX -= 1; maxX += 1; }
            if (minY === maxY) { minY -= 1; maxY += 1; }
            return {minX, maxX, minY, maxY};
        }

        mapPlotPointToCanvas(x, y, bounds) {
            const margin = {left: 56, right: 28, top: 28, bottom: 48};
            const width = this.drawingSettings.canvas.width - margin.left - margin.right;
            const height = this.drawingSettings.canvas.height - margin.top - margin.bottom;
            return {
                x: margin.left + ((x - bounds.minX) / (bounds.maxX - bounds.minX)) * width,
                y: margin.top + ((bounds.maxY - y) / (bounds.maxY - bounds.minY)) * height,
            };
        }

        plotAxisCanvasPosition(bounds, margin) {
            const plotLeft = margin.left;
            const plotRight = this.drawingSettings.canvas.width - margin.right;
            const plotTop = margin.top;
            const plotBottom = this.drawingSettings.canvas.height - margin.bottom;
            const zeroOnCanvas = this.mapPlotPointToCanvas(0, 0, bounds);
            return {
                xAxisY: Math.min(Math.max(zeroOnCanvas.y, plotTop), plotBottom),
                yAxisX: Math.min(Math.max(zeroOnCanvas.x, plotLeft), plotRight),
                plotLeft,
                plotRight,
                plotTop,
                plotBottom,
            };
        }

        evaluatePlotFunction(expression, x) {
            const safe = String(expression || "")
                .replace(/\^/g, "**")
                .replace(/\bsin\(/g, "Math.sin(")
                .replace(/\bcos\(/g, "Math.cos(")
                .replace(/\btan\(/g, "Math.tan(")
                .replace(/\bexp\(/g, "Math.exp(")
                .replace(/\blog\(/g, "Math.log(")
                .replace(/\bsqrt\(/g, "Math.sqrt(")
                .replace(/\babs\(/g, "Math.abs(")
                .replace(/\bpi\b/gi, "Math.PI");
            // Wyrażenie pochodzi od użytkownika edytującego własny rysunek. To jest tylko podgląd frontendu;
            // eksport do pgfplots zapisuje oryginalne wyrażenie.
            return Function("x", `return (${safe});`)(x);
        }

        plotFunctionPoints(functionDefinition, bounds) {
            const min = Number.isFinite(Number(functionDefinition.domainMin)) ? Number(functionDefinition.domainMin) : bounds.minX;
            const max = Number.isFinite(Number(functionDefinition.domainMax)) ? Number(functionDefinition.domainMax) : bounds.maxX;
            const points = [];
            const samples = 80;
            for (let i = 0; i <= samples; i += 1) {
                const x = min + ((max - min) * i) / samples;
                let y;
                try {
                    y = this.evaluatePlotFunction(functionDefinition.expression, x);
                } catch (_error) {
                    continue;
                }
                if (Number.isFinite(y)) {
                    points.push({x, y});
                }
            }
            return points;
        }

        renderPlotSeries(object) {
            const bounds = this.plotSeriesDataBounds(object);
            const margin = {left: 56, right: 28, top: 28, bottom: 48};
            const axisPosition = this.plotAxisCanvasPosition(bounds, margin);
            const xAxisY = axisPosition.xAxisY;
            const yAxisX = axisPosition.yAxisX;

            const axes = document.createElementNS("http://www.w3.org/2000/svg", "g");
            axes.setAttribute("class", "drawing-plot drawing-object");
            axes.setAttribute("data-object-id", object.object_id);
            axes.addEventListener("pointerdown", (event) => this.handleObjectPointerDown(event, object.object_id));

            const axisColor = "#64748b";
            const xAxis = document.createElementNS("http://www.w3.org/2000/svg", "line");
            xAxis.setAttribute("x1", axisPosition.plotLeft);
            xAxis.setAttribute("y1", xAxisY);
            xAxis.setAttribute("x2", axisPosition.plotRight);
            xAxis.setAttribute("y2", xAxisY);
            xAxis.setAttribute("stroke", axisColor);
            xAxis.setAttribute("stroke-width", "1.5");
            axes.appendChild(xAxis);

            const yAxis = document.createElementNS("http://www.w3.org/2000/svg", "line");
            yAxis.setAttribute("x1", yAxisX);
            yAxis.setAttribute("y1", axisPosition.plotTop);
            yAxis.setAttribute("x2", yAxisX);
            yAxis.setAttribute("y2", axisPosition.plotBottom);
            yAxis.setAttribute("stroke", axisColor);
            yAxis.setAttribute("stroke-width", "1.5");
            axes.appendChild(yAxis);

            const axis = object.data && object.data.axis ? object.data.axis : {};
            const xLabel = axis.xLabel || "x";
            const yLabel = axis.yLabel || "y";
            const title = axis.title || "";

            const xLabelText = document.createElementNS("http://www.w3.org/2000/svg", "text");
            xLabelText.setAttribute("x", this.drawingSettings.canvas.width - margin.right);
            xLabelText.setAttribute("y", xAxisY + 32);
            xLabelText.setAttribute("text-anchor", "end");
            xLabelText.setAttribute("fill", axisColor);
            xLabelText.setAttribute("class", "drawing-plot drawing-label");
            xLabelText.textContent = xLabel;
            axes.appendChild(xLabelText);

            const yLabelText = document.createElementNS("http://www.w3.org/2000/svg", "text");
            yLabelText.setAttribute("x", yAxisX - 12);
            yLabelText.setAttribute("y", axisPosition.plotTop + 4);
            yLabelText.setAttribute("text-anchor", "end");
            yLabelText.setAttribute("fill", axisColor);
            yLabelText.setAttribute("class", "drawing-plot drawing-label");
            yLabelText.textContent = yLabel;
            axes.appendChild(yLabelText);

            if (title) {
                const titleText = document.createElementNS("http://www.w3.org/2000/svg", "text");
                titleText.setAttribute("x", this.drawingSettings.canvas.width / 2);
                titleText.setAttribute("y", margin.top - 8);
                titleText.setAttribute("text-anchor", "middle");
                titleText.setAttribute("fill", "#111827");
                titleText.setAttribute("class", "drawing-plot drawing-label drawing-plot-title");
                titleText.textContent = title;
                axes.appendChild(titleText);
            }

            const drawSeries = (series, fallbackStyle = {}) => {
                const points = Array.isArray(series.points) ? series.points : [];
                const parsed = points.map((pair) => ({
                    x: Number(pair[0]),
                    y: Number(pair[1]),
                    xError: pair.length >= 4 ? Number(pair[2]) : null,
                    yError: pair.length >= 4 ? Number(pair[3]) : null,
                })).filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
                if (parsed.length === 0) { return; }
                const mapped = parsed.map((point) => ({...this.mapPlotPointToCanvas(point.x, point.y, bounds), source: point}));
                const plotType = series.plotType || "line";
                const style = series.style || fallbackStyle || {};
                const stroke = style.stroke || fallbackStyle.stroke || "#2563eb";
                const width = Number(style.strokeWidth || fallbackStyle.strokeWidth || 2);
                if (plotType !== "scatter" && mapped.length >= 2) {
                    const polyline = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
                    polyline.setAttribute("points", mapped.map((point) => `${point.x},${point.y}`).join(" "));
                    polyline.setAttribute("fill", "none");
                    polyline.setAttribute("stroke", stroke);
                    polyline.setAttribute("stroke-width", this.isSelected(object.object_id) ? width + 2 : width);
                    polyline.setAttribute("stroke-opacity", opacityValue(style.strokeOpacity || fallbackStyle.strokeOpacity, 1));
                    const plotDash = lineDashArray({style});
                    if (plotDash) { polyline.setAttribute("stroke-dasharray", plotDash); }
                    polyline.setAttribute("class", "drawing-plot");
                    axes.appendChild(polyline);
                }
                for (const point of mapped) {
                    const source = point.source || {};
                    if (Number.isFinite(source.xError) && source.xError > 0) {
                        const left = this.mapPlotPointToCanvas(source.x - source.xError, source.y, bounds);
                        const right = this.mapPlotPointToCanvas(source.x + source.xError, source.y, bounds);
                        const errorLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
                        errorLine.setAttribute("x1", left.x);
                        errorLine.setAttribute("y1", point.y);
                        errorLine.setAttribute("x2", right.x);
                        errorLine.setAttribute("y2", point.y);
                        errorLine.setAttribute("stroke", stroke);
                        errorLine.setAttribute("stroke-width", Math.max(1, width * 0.75));
                        errorLine.setAttribute("class", "drawing-plot drawing-plot-errorbar");
                        axes.appendChild(errorLine);
                    }
                    if (Number.isFinite(source.yError) && source.yError > 0) {
                        const bottom = this.mapPlotPointToCanvas(source.x, source.y - source.yError, bounds);
                        const top = this.mapPlotPointToCanvas(source.x, source.y + source.yError, bounds);
                        const errorLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
                        errorLine.setAttribute("x1", point.x);
                        errorLine.setAttribute("y1", bottom.y);
                        errorLine.setAttribute("x2", point.x);
                        errorLine.setAttribute("y2", top.y);
                        errorLine.setAttribute("stroke", stroke);
                        errorLine.setAttribute("stroke-width", Math.max(1, width * 0.75));
                        errorLine.setAttribute("class", "drawing-plot drawing-plot-errorbar");
                        axes.appendChild(errorLine);
                    }
                }
                if (plotType === "scatter" || plotType === "line_markers" || style.showPoints) {
                    for (const point of mapped) {
                        const marker = document.createElementNS("http://www.w3.org/2000/svg", "circle");
                        marker.setAttribute("cx", point.x);
                        marker.setAttribute("cy", point.y);
                        marker.setAttribute("r", this.isSelected(object.object_id) ? "5" : "4");
                        marker.setAttribute("fill", stroke);
                        marker.setAttribute("fill-opacity", opacityValue(style.strokeOpacity || fallbackStyle.strokeOpacity, 1));
                        marker.setAttribute("class", "drawing-plot");
                        axes.appendChild(marker);
                    }
                }
            };

            if (object.type === "plot.chart") {
                const seriesList = object.data && Array.isArray(object.data.series) ? object.data.series : [];
                for (const series of seriesList) { drawSeries(series, object.style || {}); }
                const functions = object.data && Array.isArray(object.data.functions) ? object.data.functions : [];
                for (const fn of functions) {
                    const sampled = this.plotFunctionPoints(fn, bounds);
                    drawSeries({points: sampled.map((point) => [point.x, point.y]), plotType: "line", style: {stroke: fn.color || "#dc2626", strokeWidth: 2}}, {});
                }
                if (object.data && object.data.legend && object.data.legend.show === false) {
                    // no legend
                } else {
                    const labels = [
                        ...seriesList.map((series) => series.label).filter(Boolean),
                        ...functions.map((fn) => fn.label || fn.expression).filter(Boolean),
                    ];
                    labels.slice(0, 6).forEach((label, index) => {
                        const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
                        text.setAttribute("x", this.drawingSettings.canvas.width - margin.right - 8);
                        text.setAttribute("y", margin.top + 16 + index * 18);
                        text.setAttribute("text-anchor", "end");
                        text.setAttribute("fill", "#334155");
                        text.setAttribute("class", "drawing-plot drawing-label");
                        text.textContent = label;
                        axes.appendChild(text);
                    });
                }
            } else {
                drawSeries({points: object.data.points || [], label: object.data.label || "", plotType: object.data.plotType || "line", style: object.style || {}}, object.style || {});
                const label = object.data && object.data.label;
                if (label && shouldShowLabel(object)) {
                    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
                    text.setAttribute("x", this.drawingSettings.canvas.width - margin.right - 8);
                    text.setAttribute("y", margin.top + 16);
                    text.setAttribute("text-anchor", "end");
                    text.setAttribute("fill", object.style && object.style.stroke ? object.style.stroke : "#2563eb");
                    text.setAttribute("class", "drawing-plot drawing-label");
                    text.textContent = label;
                    axes.appendChild(text);
                }
            }

            this.svg.appendChild(axes);
        }

        polygonPointCoordinates(object) {
            const pointIds = object.data && Array.isArray(object.data.points) ? object.data.points : [];
            return pointIds
                .map((pointId) => this.findPoint(pointId))
                .filter(Boolean)
                .map((point) => {
                    const x = Number(point.data && point.data.x);
                    const y = Number(point.data && point.data.y);
                    return Number.isFinite(x) && Number.isFinite(y) ? {x, y} : null;
                })
                .filter(Boolean);
        }

        renderPolygon(object) {
            const points = this.polygonPointCoordinates(object);
            if (points.length < 3) {
                return;
            }

            const pointsText = points.map((point) => `${point.x},${point.y}`).join(" ");
            const width = strokeWidth(object);

            const hitPolygon = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
            hitPolygon.setAttribute("points", pointsText);
            hitPolygon.setAttribute("fill", "transparent");
            hitPolygon.setAttribute("stroke", "transparent");
            hitPolygon.setAttribute("stroke-width", Math.max(width + 12, 14));
            hitPolygon.setAttribute("class", "drawing-polygon-hit drawing-object");
            hitPolygon.setAttribute("data-object-id", object.object_id);
            hitPolygon.addEventListener("pointerdown", (event) => this.handleObjectPointerDown(event, object.object_id));
            this.svg.appendChild(hitPolygon);

            const polygon = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
            polygon.setAttribute("points", pointsText);
            const fill = object.style && object.style.fill ? object.style.fill : "none";
            polygon.setAttribute("fill", fill === "none" ? "none" : fill);
            polygon.setAttribute("stroke", object.style && object.style.stroke ? object.style.stroke : "#111827");
            polygon.setAttribute("stroke-width", this.isSelected(object.object_id) ? width + 2 : width);
            applyLineStyle(polygon, object);
            applyFillStyle(polygon, object);
            polygon.setAttribute("class", this.isSelected(object.object_id) ? "drawing-polygon drawing-object drawing-polygon--selected" : "drawing-polygon drawing-object");
            polygon.setAttribute("data-object-id", object.object_id);
            polygon.addEventListener("pointerdown", (event) => this.handleObjectPointerDown(event, object.object_id));
            this.svg.appendChild(polygon);

            const label = object.data && object.data.label;
            if (label && shouldShowLabel(object)) {
                const centerX = points.reduce((sum, point) => sum + point.x, 0) / points.length;
                const centerY = points.reduce((sum, point) => sum + point.y, 0) / points.length;
                const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
                const placement = labelPlacement(object, 18, "center");
                text.setAttribute("x", centerX + placement.dx);
                text.setAttribute("y", centerY + placement.dy);
                text.setAttribute("text-anchor", placement.anchor);
                text.setAttribute("dominant-baseline", placement.baseline);
                text.setAttribute("class", "drawing-label drawing-object");
                text.setAttribute("data-object-id", object.object_id);
                applyTextStyle(text, object, 14);
                text.textContent = label;
                text.addEventListener("pointerdown", (event) => this.handleObjectPointerDown(event, object.object_id));
                this.svg.appendChild(text);
            }
        }

        renderCircle(object) {
            const center = this.findPoint(object.data && object.data.center);
            const point = this.findPoint(object.data && object.data.point);
            if (!center || !point) {
                return;
            }

            const cx = Number(center.data && center.data.x);
            const cy = Number(center.data && center.data.y);
            const px = Number(point.data && point.data.x);
            const py = Number(point.data && point.data.y);
            if (![cx, cy, px, py].every(Number.isFinite)) {
                return;
            }

            const radius = Math.hypot(px - cx, py - cy);
            if (!Number.isFinite(radius) || radius <= 0) {
                return;
            }

            const width = strokeWidth(object);
            const hitCircle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
            hitCircle.setAttribute("cx", cx);
            hitCircle.setAttribute("cy", cy);
            hitCircle.setAttribute("r", radius);
            hitCircle.setAttribute("fill", "none");
            hitCircle.setAttribute("stroke", "transparent");
            hitCircle.setAttribute("stroke-width", Math.max(width + 12, 14));
            hitCircle.setAttribute("class", "drawing-circle-hit drawing-object");
            hitCircle.setAttribute("data-object-id", object.object_id);
            hitCircle.addEventListener("pointerdown", (event) => this.handleObjectPointerDown(event, object.object_id));
            this.svg.appendChild(hitCircle);

            const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
            circle.setAttribute("cx", cx);
            circle.setAttribute("cy", cy);
            circle.setAttribute("r", radius);
            circle.setAttribute("fill", object.style && object.style.fill && object.style.fill !== "none" ? object.style.fill : "none");
            circle.setAttribute("stroke", object.style && object.style.stroke ? object.style.stroke : "#111827");
            circle.setAttribute("stroke-width", this.isSelected(object.object_id) ? width + 2 : width);
            applyLineStyle(circle, object);
            applyFillStyle(circle, object);
            circle.setAttribute("class", this.isSelected(object.object_id) ? "drawing-circle drawing-object drawing-circle--selected" : "drawing-circle drawing-object");
            circle.setAttribute("data-object-id", object.object_id);
            circle.addEventListener("pointerdown", (event) => this.handleObjectPointerDown(event, object.object_id));
            this.svg.appendChild(circle);

            const label = object.data && object.data.label;
            if (label && shouldShowLabel(object)) {
                const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
                const placement = labelPlacement(object, radius + 10, "right");
                text.setAttribute("x", cx + placement.dx);
                text.setAttribute("y", cy + placement.dy);
                text.setAttribute("text-anchor", placement.anchor);
                text.setAttribute("dominant-baseline", placement.baseline);
                text.setAttribute("class", "drawing-label drawing-object");
                text.setAttribute("data-object-id", object.object_id);
                applyTextStyle(text, object, 14);
                text.textContent = label;
                text.addEventListener("pointerdown", (event) => this.handleObjectPointerDown(event, object.object_id));
                this.svg.appendChild(text);
            }
        }

        renderLine(object) {
            const source = this.findPoint(object.data && object.data.source);
            const target = this.findPoint(object.data && object.data.target);
            if (!source || !target) {
                return;
            }

            const x1 = Number(source.data && source.data.x);
            const y1 = Number(source.data && source.data.y);
            const x2 = Number(target.data && target.data.x);
            const y2 = Number(target.data && target.data.y);
            if (![x1, y1, x2, y2].every(Number.isFinite)) {
                return;
            }

            const width = strokeWidth(object);
            const hitLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
            hitLine.setAttribute("x1", x1);
            hitLine.setAttribute("y1", y1);
            hitLine.setAttribute("x2", x2);
            hitLine.setAttribute("y2", y2);
            hitLine.setAttribute("stroke", "transparent");
            hitLine.setAttribute("stroke-width", Math.max(width + 12, 14));
            hitLine.setAttribute("class", "drawing-line-hit drawing-object");
            hitLine.setAttribute("data-object-id", object.object_id);
            hitLine.addEventListener("pointerdown", (event) => this.handleObjectPointerDown(event, object.object_id));
            this.svg.appendChild(hitLine);

            const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
            line.setAttribute("x1", x1);
            line.setAttribute("y1", y1);
            line.setAttribute("x2", x2);
            line.setAttribute("y2", y2);
            line.setAttribute("stroke", object.style && object.style.stroke ? object.style.stroke : "#111827");
            line.setAttribute("stroke-width", this.isSelected(object.object_id) ? width + 2 : width);
            applyLineStyle(line, object);
            line.setAttribute("class", this.isSelected(object.object_id) ? "drawing-line drawing-object drawing-line--selected" : "drawing-line drawing-object");
            line.setAttribute("data-object-id", object.object_id);
            line.addEventListener("pointerdown", (event) => this.handleObjectPointerDown(event, object.object_id));
            this.svg.appendChild(line);

            if (object.style && object.style.directed) {
                this.renderArrowHead(x1, y1, x2, y2, object);
            }

            const label = object.data && object.data.label;
            if (label && shouldShowLabel(object)) {
                const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
                const placement = labelPlacement(object, 14, "above");
                text.setAttribute("x", (x1 + x2) / 2 + placement.dx);
                text.setAttribute("y", (y1 + y2) / 2 + placement.dy);
                text.setAttribute("text-anchor", placement.anchor);
                text.setAttribute("dominant-baseline", placement.baseline);
                text.setAttribute("class", "drawing-label drawing-object");
                text.setAttribute("data-object-id", object.object_id);
                applyTextStyle(text, object, 14);
                text.textContent = label;
                text.addEventListener("pointerdown", (event) => this.handleObjectPointerDown(event, object.object_id));
                this.svg.appendChild(text);
            }
        }

        renderArrowHead(x1, y1, x2, y2, object) {
            const angle = Math.atan2(y2 - y1, x2 - x1);
            const size = 10;
            const radius = pointRadius(this.findPoint(object.data && object.data.target) || {style: {}});
            const tipX = x2 - Math.cos(angle) * radius;
            const tipY = y2 - Math.sin(angle) * radius;
            const leftX = tipX - size * Math.cos(angle - Math.PI / 6);
            const leftY = tipY - size * Math.sin(angle - Math.PI / 6);
            const rightX = tipX - size * Math.cos(angle + Math.PI / 6);
            const rightY = tipY - size * Math.sin(angle + Math.PI / 6);

            const polygon = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
            polygon.setAttribute("points", `${tipX},${tipY} ${leftX},${leftY} ${rightX},${rightY}`);
            polygon.setAttribute("fill", object.style && object.style.stroke ? object.style.stroke : "#111827");
            polygon.setAttribute("fill-opacity", opacityValue(object.style && object.style.strokeOpacity, 1));
            polygon.setAttribute("class", "drawing-line drawing-object");
            polygon.setAttribute("data-object-id", object.object_id);
            polygon.addEventListener("pointerdown", (event) => this.handleObjectPointerDown(event, object.object_id));
            this.svg.appendChild(polygon);
        }

        renderMidpoint(object) {
            const position = this.resolveObjectPosition(object);
            if (!position) { return; }
            const derived = {
                ...object,
                data: {...(object.data || {}), x: position.x, y: position.y},
                style: {
                    ...(object.style || {}),
                    fill: "#9ca3af",
                    stroke: "#4b5563",
                },
            };
            this.renderPoint(derived);
        }

        renderPoint(object) {
            const x = Number(object.data && object.data.x);
            const y = Number(object.data && object.data.y);
            if (!Number.isFinite(x) || !Number.isFinite(y)) {
                return;
            }

            const radius = pointRadius(object);
            const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
            circle.setAttribute("cx", x);
            circle.setAttribute("cy", y);
            circle.setAttribute("r", radius);
            circle.setAttribute("fill", object.style && object.style.fill ? object.style.fill : "#111827");
            circle.setAttribute("stroke", object.style && object.style.stroke ? object.style.stroke : "#111827");
            circle.setAttribute("stroke-width", this.isSelected(object.object_id) || object.object_id === this.pendingLineStartId || (this.pendingIntersectionPointIds || []).includes(object.object_id) || (this.pendingProjectionPointIds || []).includes(object.object_id) || (this.pendingSegmentProjectionPointIds || []).includes(object.object_id) || (this.pendingCircleNearestPointIds || []).includes(object.object_id) || (this.pendingLineCircleIntersectionPointIds || []).includes(object.object_id) || (this.pendingCircleCircleIntersectionPointIds || []).includes(object.object_id) || (this.pendingReflectionPointIds || []).includes(object.object_id) || (this.pendingRotationPointIds || []).includes(object.object_id) || (this.pendingCentralReflectionPointIds || []).includes(object.object_id) || (this.pendingHomothetyPointIds || []).includes(object.object_id) || (this.pendingTranslationPointIds || []).includes(object.object_id) || (this.pendingPolygonPointIds || []).includes(object.object_id) ? "3" : strokeWidth(object));
            applyLineStyle(circle, object);
            applyFillStyle(circle, object);
            circle.setAttribute("class", "drawing-object");
            circle.setAttribute("data-object-id", object.object_id);
            circle.addEventListener("pointerdown", (event) => this.handleObjectPointerDown(event, object.object_id));
            this.svg.appendChild(circle);

            const label = object.data && object.data.label;
            if (label && shouldShowLabel(object)) {
                const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
                const placement = labelPlacement(object, radius + 8, "above-right");
                text.setAttribute("x", x + placement.dx);
                text.setAttribute("y", y + placement.dy);
                text.setAttribute("text-anchor", placement.anchor);
                text.setAttribute("dominant-baseline", placement.baseline);
                text.setAttribute("class", "drawing-label drawing-object");
                text.setAttribute("data-object-id", object.object_id);
                applyTextStyle(text, object, 14);
                text.textContent = label;
                text.addEventListener("pointerdown", (event) => this.handleObjectPointerDown(event, object.object_id));
                this.svg.appendChild(text);
            }
        }

        renderRelativeLabel(object) {
            const position = this.relativeLabelPosition(object);
            if (!position || !shouldShowLabel(object)) { return; }
            const textValue = object.data && object.data.text;
            if (!textValue) { return; }
            const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
            text.setAttribute("x", position.x);
            text.setAttribute("y", position.y);
            text.setAttribute("class", "drawing-text drawing-label drawing-object" + (this.isSelected(object.object_id) ? " drawing-text--selected" : ""));
            text.setAttribute("data-object-id", object.object_id);
            text.setAttribute("fill", object.style && (object.style.fill || object.style.stroke) ? (object.style.fill || object.style.stroke) : "#111827");
            text.setAttribute("font-size", fontSize(object, 14));
            text.setAttribute("text-anchor", "middle");
            text.setAttribute("dominant-baseline", "middle");
            text.setAttribute("fill-opacity", opacityValue(object.style && object.style.fillOpacity, 1));
            text.textContent = textValue;
            text.addEventListener("pointerdown", (event) => this.handleObjectPointerDown(event, object.object_id));
            this.svg.appendChild(text);
        }

        renderLatexText(object) {
            const x = Number(object.data && object.data.x);
            const y = Number(object.data && object.data.y);
            if (!Number.isFinite(x) || !Number.isFinite(y)) {
                return;
            }

            if (!shouldShowLabel(object)) {
                return;
            }

            const textValue = object.data && (object.data.text || object.data.label);
            if (!textValue) {
                return;
            }

            const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
            text.setAttribute("x", x);
            text.setAttribute("y", y);
            text.setAttribute("class", "drawing-text drawing-object");
            text.setAttribute("data-object-id", object.object_id);
            text.setAttribute("fill", object.style && object.style.fill ? object.style.fill : "#111827");
            text.setAttribute("stroke", "none");
            text.setAttribute("font-size", fontSize(object, 18));
            text.setAttribute("text-anchor", "middle");
            text.setAttribute("fill-opacity", opacityValue(object.style && object.style.fillOpacity, 1));
            text.textContent = textValue;
            if (this.isSelected(object.object_id)) {
                text.classList.add("drawing-text--selected");
            }
            text.addEventListener("pointerdown", (event) => this.handleObjectPointerDown(event, object.object_id));
            this.svg.appendChild(text);
        }


        objectTypeLabel(object) {
            const labels = {
                "graph.vertex": "Wierzchołek",
                "graph.edge": "Krawędź",
                "geometry.point": "Punkt",
                "geometry.midpoint": "Środek odcinka",
                "geometry.line_intersection": "Punkt przecięcia prostych",
                "geometry.perpendicular_projection": "Rzut prostokątny na prostą",
                "geometry.segment_projection": "Najbliższy punkt na odcinku",
                "geometry.circle_nearest_point": "Najbliższy punkt na okręgu",
                "geometry.line_circle_intersection": "Przecięcie prostej i okręgu",
                "geometry.circle_circle_intersection": "Przecięcie dwóch okręgów",
                "geometry.circumcenter": "Środek okręgu opisanego",
                "geometry.orthocenter": "Ortocentrum trójkąta",
                "geometry.nine_point_center": "Środek okręgu dziewięciu punktów",
                "geometry.centroid": "Środek ciężkości trójkąta",
                "geometry.incenter": "Środek okręgu wpisanego w trójkąt",
                "geometry.excenter": "Środek okręgu dopisanego do trójkąta",
                "geometry.excircle_touchpoint": "Punkt styczności okręgu dopisanego",
                "geometry.incircle_touchpoint": "Punkt styczności okręgu wpisanego",
                "geometry.reflection_across_line": "Odbicie punktu względem prostej",
                "geometry.rotation_around_point": "Obrót punktu wokół środka",
                "geometry.central_reflection": "Symetria środkowa punktu",
                "geometry.homothety": "Jednokładność punktu względem środka",
                "geometry.translation_by_vector": "Translacja punktu o wektor",
                "geometry.segment": "Odcinek",
                "geometry.circle": "Okrąg",
                "geometry.polygon": "Wielokąt",
                "text.latex": "Tekst",
                "label.relative": "Etykieta przypięta",
                "group": "Grupa",
                "plot.chart": "Wykres",
                "plot.series": "Seria wykresu",
            };
            const definition = registeredObjectType(object);
            return labels[object.type] || (definition && definition.displayName) || object.type;
        }

        objectDisplayLabel(object) {
            const data = object.data || {};
            if (isGroup(object)) {
                return data.name || data.label || "Grupa";
            }
            if (isTextLike(object)) {
                return data.text || data.label || object.object_id;
            }
            if (object.type === "plot.chart") {
                const axis = data.axis || {};
                return axis.title || data.label || object.object_id;
            }
            return data.label || object.object_id;
        }

        objectShortSummary(object) {
            const data = object.data || {};
            if (isGroup(object)) {
                return `${this.groupChildIds(object).length} elementy`;
            }
            if (isPointLike(object) || isTextLike(object)) {
                const x = Number.isFinite(Number(data.x)) ? Math.round(Number(data.x)) : "?";
                const y = Number.isFinite(Number(data.y)) ? Math.round(Number(data.y)) : "?";
                return `x=${x}, y=${y}`;
            }
            if (isLineLike(object)) {
                return `${data.source || "?"} → ${data.target || "?"}`;
            }
            if (isCircleLike(object)) {
                return `środek: ${data.center || "?"}, punkt: ${data.point || "?"}`;
            }
            if (isPolygonLike(object)) {
                const count = Array.isArray(data.points) ? data.points.length : 0;
                return `${count} wierzchołki`;
            }
            if (object.type === "plot.chart") {
                const seriesCount = Array.isArray(data.series) ? data.series.length : 0;
                const functionCount = Array.isArray(data.functions) ? data.functions.length : 0;
                return `${seriesCount} serie, ${functionCount} funkcje`;
            }
            return object.object_id;
        }

        async toggleObjectVisibility(objectId) {
            const clickedObject = this.findObject(objectId);
            if (!clickedObject) {
                return;
            }
            const objects = this.selectionTargets(objectId);
            const targetVisible = !objectIsVisible(clickedObject);
            await this.applyToSelection(async (object) => {
                const newStyle = {...(object.style || {}), visible: targetVisible};
                const result = await this.request(this.objectDetailUrl(object.object_id), {
                    method: "PATCH",
                    headers: {"Content-Type": "application/json"},
                    body: JSON.stringify({style: newStyle}),
                });
                return result.object;
            }, {
                objects,
                successMessage: (updated) => (targetVisible ? "Pokazano " : "Ukryto ") + updated.length + " obiekt" + (updated.length === 1 ? "." : "ów."),
                errorMessage: "Nie udało się zmienić widoczności zaznaczenia",
            });
        }

        renderObjectList() {
            if (!this.objectList) {
                return;
            }

            if (this.flattenObjects().length === 0) {
                this.objectList.innerHTML = "<p class='drawing-editor__empty'>Brak obiektów. Kliknij w canvas, żeby dodać pierwszy obiekt.</p>";
                return;
            }

            const rows = this.visibleObjectTreeEntries().map((entry) => {
                const object = entry.object;
                const depth = entry.depth || 0;
                const selectedClass = this.isSelected(object.object_id) ? " drawing-editor__object-row--selected" : "";
                const hiddenClass = objectIsVisible(object) ? "" : " drawing-editor__object-row--hidden";
                const order = Number.isFinite(Number(object.order)) ? Number(object.order) : 0;
                const visibilityLabel = objectIsVisible(object) ? "Ukryj" : "Pokaż";
                const visibilityIcon = objectIsVisible(object) ? "◉" : "○";
                const group = isGroup(object);
                const collapsed = group && this.collapsedGroupIds.has(object.object_id);
                const expander = group ? `
                    <button type="button" class="drawing-editor__tree-toggle" data-action="toggle-group-collapsed" data-object-id="${escapeHtml(object.object_id)}" aria-expanded="${collapsed ? "false" : "true"}" title="${collapsed ? "Rozwiń grupę" : "Zwiń grupę"}">
                        <span aria-hidden="true">${collapsed ? "▸" : "▾"}</span>
                    </button>` : `<span class="drawing-editor__tree-spacer" aria-hidden="true"></span>`;
                const renameButton = group ? `
                    <button type="button" class="drawing-editor__object-rename" data-action="rename-group" data-object-id="${escapeHtml(object.object_id)}" title="Zmień nazwę grupy">✎</button>` : "";
                return `
                    <article class="drawing-editor__object-row${selectedClass}${hiddenClass}${group ? " drawing-editor__object-row--group" : ""}" data-object-row="${escapeHtml(object.object_id)}" data-object-depth="${depth}" style="--object-depth: ${depth}">
                        <div class="drawing-editor__tree-prefix">${expander}</div>
                        <button type="button" class="drawing-editor__object-main" data-object-select="${escapeHtml(object.object_id)}">
                            <span class="drawing-editor__object-title">
                                <strong>${escapeHtml(this.objectDisplayLabel(object))}</strong>
                                <code>${escapeHtml(this.objectTypeLabel(object))}</code>
                            </span>
                            <small>${escapeHtml(this.objectShortSummary(object))}</small>
                            <small class="drawing-editor__object-meta">ID: ${escapeHtml(object.object_id)} · kolejność: ${order}</small>
                        </button>
                        <div class="drawing-editor__object-actions">
                            ${renameButton}
                            <button type="button" class="drawing-editor__object-visibility" data-action="toggle-object-visibility" data-object-id="${escapeHtml(object.object_id)}" title="${visibilityLabel} obiekt">
                                <span aria-hidden="true">${visibilityIcon}</span>
                                <span>${visibilityLabel}</span>
                            </button>
                        </div>
                    </article>
                `;
            }).join("");

            this.objectList.innerHTML = rows;
            this.objectList.querySelectorAll("[data-object-select]").forEach((row) => {
                row.addEventListener("click", (event) => {
                    if (event.shiftKey || event.ctrlKey || event.metaKey) {
                        this.toggleSelection(row.dataset.objectSelect);
                        this.render();
                        if (this.selectedObjectIds.size > 0) {
                            this.openEditPanel("object");
                        }
                        this.setStatus("Zaznaczono " + this.selectedObjectIds.size + " obiekt" + (this.selectedObjectIds.size === 1 ? "." : "ów."));
                    } else {
                        this.selectObject(row.dataset.objectSelect);
                    }
                });
            });
            this.objectList.querySelectorAll("[data-action='toggle-group-collapsed']").forEach((button) => {
                button.addEventListener("click", (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    this.toggleGroupCollapsed(button.dataset.objectId);
                });
            });
            this.objectList.querySelectorAll("[data-action='rename-group']").forEach((button) => {
                button.addEventListener("click", (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    this.renameGroup(button.dataset.objectId);
                });
            });
            this.objectList.querySelectorAll("[data-action='toggle-object-visibility']").forEach((button) => {
                button.addEventListener("click", (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    this.toggleObjectVisibility(button.dataset.objectId);
                });
            });
        }
    }

    document.addEventListener("DOMContentLoaded", () => {
        document.querySelectorAll("[data-drawing-editor]").forEach((root) => {
            new DrawingEditor(root);
        });
    });
}());
