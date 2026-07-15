(function (global) {
    "use strict";

    class ToolRegistry {
        constructor() {
            this.tools = new Map();
            this.plugins = new Map();
            this.objectTypes = new Map();
            this.listeners = new Set();
        }

        validateTool(definition) {
            if (!definition || typeof definition !== "object") {
                throw new TypeError("Definicja narzędzia musi być obiektem.");
            }
            if (!definition.id || typeof definition.id !== "string") {
                throw new TypeError("Narzędzie musi mieć tekstowe pole id.");
            }
            if (!definition.label || typeof definition.label !== "string") {
                throw new TypeError("Narzędzie musi mieć tekstową etykietę label.");
            }
            if (definition.modes && !Array.isArray(definition.modes)) {
                throw new TypeError("Pole modes musi być tablicą.");
            }
        }


        validateObjectType(definition) {
            if (!definition || typeof definition !== "object") {
                throw new TypeError("Definicja typu obiektu musi być obiektem.");
            }
            if (!definition.id || typeof definition.id !== "string") {
                throw new TypeError("Typ obiektu musi mieć tekstowe pole id.");
            }
            if (definition.modes && !Array.isArray(definition.modes)) {
                throw new TypeError("Pole modes typu obiektu musi być tablicą.");
            }
            if (definition.dependencyFields && !Array.isArray(definition.dependencyFields)) {
                throw new TypeError("Pole dependencyFields musi być tablicą.");
            }
            if (definition.resolvePosition && typeof definition.resolvePosition !== "function") {
                throw new TypeError("resolvePosition musi być funkcją.");
            }
            if (definition.render && typeof definition.render !== "function") {
                throw new TypeError("render musi być funkcją.");
            }
            if (definition.propertyFields && !Array.isArray(definition.propertyFields)) {
                throw new TypeError("Pole propertyFields musi być tablicą.");
            }
            for (const field of definition.propertyFields || []) {
                if (!field || typeof field !== "object" || !field.key || typeof field.key !== "string") {
                    throw new TypeError("Każde pole właściwości musi mieć tekstowy klucz key.");
                }
                if (!field.label || typeof field.label !== "string") {
                    throw new TypeError("Każde pole właściwości musi mieć tekstową etykietę label.");
                }
                if (field.validate && typeof field.validate !== "function") {
                    throw new TypeError("Walidator pola właściwości musi być funkcją.");
                }
            }
            if (definition.buildPropertyPatch && typeof definition.buildPropertyPatch !== "function") {
                throw new TypeError("buildPropertyPatch musi być funkcją.");
            }
            if (definition.objectActions && !Array.isArray(definition.objectActions)) {
                throw new TypeError("Pole objectActions musi być tablicą.");
            }
            for (const action of definition.objectActions || []) {
                if (!action || typeof action !== "object" || !action.id || typeof action.id !== "string") {
                    throw new TypeError("Każda akcja obiektowa musi mieć tekstowy identyfikator id.");
                }
                if (!action.label || typeof action.label !== "string") {
                    throw new TypeError("Każda akcja obiektowa musi mieć tekstową etykietę label.");
                }
                if (action.buildPatch && typeof action.buildPatch !== "function") {
                    throw new TypeError("buildPatch akcji obiektowej musi być funkcją.");
                }
                if (action.run && typeof action.run !== "function") {
                    throw new TypeError("run akcji obiektowej musi być funkcją.");
                }
                if (action.runSelection && typeof action.runSelection !== "function") {
                    throw new TypeError("runSelection akcji obiektowej musi być funkcją.");
                }
                if (action.supportsMultiple !== undefined && typeof action.supportsMultiple !== "boolean") {
                    throw new TypeError("supportsMultiple akcji obiektowej musi być wartością logiczną.");
                }
                if (action.createsObjects !== undefined && typeof action.createsObjects !== "boolean") {
                    throw new TypeError("createsObjects akcji obiektowej musi być wartością logiczną.");
                }
                // Poprzedni kontrakt: Akcja obiektowa musi definiować buildPatch albo run.
                if (!action.buildPatch && !action.run && !action.runSelection) {
                    throw new TypeError("Akcja obiektowa musi definiować buildPatch, run albo runSelection.");
                }
                if (action.isEnabled && typeof action.isEnabled !== "function") {
                    throw new TypeError("isEnabled akcji obiektowej musi być funkcją.");
                }
                if (action.isVisible && typeof action.isVisible !== "function") {
                    throw new TypeError("isVisible akcji obiektowej musi być funkcją.");
                }
            }
        }

        registerObjectType(definition, pluginId = "core") {
            this.validateObjectType(definition);
            if (this.objectTypes.has(definition.id)) {
                throw new Error("Typ obiektu o id „" + definition.id + "” jest już zarejestrowany.");
            }
            const objectType = Object.freeze({
                modes: ["mixed"],
                dependencyFields: [],
                pointLike: false,
                positioned: false,
                displayName: definition.id,
                ...definition,
                pluginId,
            });
            this.objectTypes.set(objectType.id, objectType);
            this.emit({type: "object-type-registered", objectType});
            return objectType;
        }

        unregisterObjectType(typeId) {
            const objectType = this.objectTypes.get(typeId);
            if (!objectType) { return false; }
            this.objectTypes.delete(typeId);
            this.emit({type: "object-type-unregistered", objectType});
            return true;
        }

        getObjectType(typeId) {
            return this.objectTypes.get(typeId) || null;
        }

        registerTool(definition, pluginId = "core") {
            this.validateTool(definition);
            if (this.tools.has(definition.id)) {
                throw new Error("Narzędzie o id „" + definition.id + "” jest już zarejestrowane.");
            }
            const tool = Object.freeze({
                group: "plugins",
                groupLabel: "Dodatki",
                modes: ["graph", "geometry", "plot", "mixed"],
                order: 1000,
                help: "",
                ...definition,
                pluginId,
            });
            this.tools.set(tool.id, tool);
            this.emit({type: "tool-registered", tool});
            return tool;
        }

        unregisterTool(toolId) {
            const tool = this.tools.get(toolId);
            if (!tool) {
                return false;
            }
            this.tools.delete(toolId);
            this.emit({type: "tool-unregistered", tool});
            return true;
        }

        registerPlugin(plugin) {
            if (!plugin || typeof plugin !== "object" || !plugin.id || typeof plugin.id !== "string") {
                throw new TypeError("Plugin musi mieć tekstowe pole id.");
            }
            if (this.plugins.has(plugin.id)) {
                throw new Error("Plugin o id „" + plugin.id + "” jest już zarejestrowany.");
            }
            const normalized = Object.freeze({name: plugin.id, version: "1.0.0", tools: [], objectTypes: [], ...plugin});
            this.plugins.set(normalized.id, normalized);
            const registered = [];
            const registeredTypes = [];
            try {
                for (const objectType of normalized.objectTypes || []) {
                    registeredTypes.push(this.registerObjectType(objectType, normalized.id));
                }
                for (const tool of normalized.tools || []) {
                    registered.push(this.registerTool(tool, normalized.id));
                }
            } catch (error) {
                registered.forEach((tool) => this.unregisterTool(tool.id));
                registeredTypes.forEach((objectType) => this.unregisterObjectType(objectType.id));
                this.plugins.delete(normalized.id);
                throw error;
            }
            if (typeof normalized.setup === "function") {
                normalized.setup(this.publicApi());
            }
            this.emit({type: "plugin-registered", plugin: normalized});
            return normalized;
        }

        getTool(toolId) {
            return this.tools.get(toolId) || null;
        }

        toolsForMode(mode) {
            return Array.from(this.tools.values())
                .filter((tool) => tool.modes.includes(mode) || tool.modes.includes("all"))
                .sort((left, right) => left.order - right.order || left.label.localeCompare(right.label, "pl"));
        }

        subscribe(listener) {
            this.listeners.add(listener);
            return () => this.listeners.delete(listener);
        }

        emit(event) {
            this.listeners.forEach((listener) => listener(event));
            global.dispatchEvent(new CustomEvent("route-editor:registry-change", {detail: event}));
        }

        publicApi() {
            return Object.freeze({
                registerTool: (definition) => this.registerTool(definition),
                unregisterTool: (toolId) => this.unregisterTool(toolId),
                getTool: (toolId) => this.getTool(toolId),
                toolsForMode: (mode) => this.toolsForMode(mode),
                registerObjectType: (definition) => this.registerObjectType(definition),
                unregisterObjectType: (typeId) => this.unregisterObjectType(typeId),
                getObjectType: (typeId) => this.getObjectType(typeId),
            });
        }
    }

    const registry = new ToolRegistry();
    const coreTools = [
        {id: "select", label: "Zaznacz / przesuń", group: "selection", groupLabel: "Zaznaczanie", modes: ["all"], order: 0,
            help: "Tryb zaznaczania: kliknij obiekt na rysunku, żeby go zaznaczyć. Ctrl/Shift-klik dodaje obiekty do zaznaczenia."},
        {id: "text.latex", label: "Tekst LaTeX", group: "text", groupLabel: "Tekst", modes: ["graph", "geometry", "mixed"], order: 100,
            help: "Tryb tekstu LaTeX: wpisz treść w polu etykiety i kliknij canvas, żeby dodać tekst."},
        {id: "label.relative", label: "Etykieta przypięta", group: "relative-label", groupLabel: "Etykiety zależne", modes: ["graph", "geometry", "mixed"], order: 150,
            help: "Tryb etykiety przypiętej: wpisz tekst, a następnie kliknij punkt lub wierzchołek."},
        {id: "graph.vertex", label: "Wierzchołek", group: "graph", groupLabel: "Grafy", modes: ["graph", "mixed"], order: 200},
        {id: "graph.edge.undirected", label: "Krawędź nieskierowana", group: "graph", groupLabel: "Grafy", modes: ["graph", "mixed"], order: 210},
        {id: "graph.edge.directed", label: "Krawędź skierowana", group: "graph", groupLabel: "Grafy", modes: ["graph", "mixed"], order: 220},
        {id: "geometry.point", label: "Punkt", group: "geometry-basic", groupLabel: "Obiekty podstawowe", modes: ["geometry", "mixed"], order: 300},
        {id: "geometry.midpoint", commandId: "midpoint", label: "Środek odcinka", group: "geometry-points", groupLabel: "Punkty i przecięcia", modes: ["geometry", "mixed"], order: 310,
            help: "Komenda środek odcinka: kliknij dwa istniejące punkty geometryczne."},
        {id: "geometry.line_intersection", commandId: "line_intersection", label: "Przecięcie prostych", group: "geometry-points", groupLabel: "Punkty i przecięcia", modes: ["geometry", "mixed"], order: 315,
            help: "Kliknij kolejno cztery punkty: dwa dla pierwszej prostej i dwa dla drugiej."},
        {id: "geometry.perpendicular_projection", commandId: "perpendicular_projection", label: "Rzut prostokątny", group: "geometry-points", groupLabel: "Punkty i przecięcia", modes: ["geometry", "mixed"], order: 317,
            help: "Kliknij punkt rzutowany, a następnie dwa punkty wyznaczające prostą."},
        {id: "geometry.segment_projection", commandId: "segment_projection", label: "Rzut na odcinek", group: "geometry-points", groupLabel: "Punkty i przecięcia", modes: ["geometry", "mixed"], order: 317.5,
            help: "Kliknij punkt, a następnie dwa końce odcinka. Wynik pozostanie na odcinku."},
        {id: "geometry.circle_nearest_point", commandId: "circle_nearest_point", label: "Punkt na okręgu", group: "geometry-points", groupLabel: "Punkty i przecięcia", modes: ["geometry", "mixed"], order: 317.75,
            help: "Kliknij punkt, środek okręgu i punkt wyznaczający promień."},
        {id: "geometry.line_circle_intersection", commandId: "line_circle_intersection", label: "Prosta ∩ okrąg", group: "geometry-points", groupLabel: "Punkty i przecięcia", modes: ["geometry", "mixed"], order: 317.8,
            help: "Kliknij dwa punkty prostej, środek okręgu i punkt wyznaczający promień."},
        {id: "geometry.circle_circle_intersection", commandId: "circle_circle_intersection", label: "Okrąg ∩ okrąg", group: "geometry-points", groupLabel: "Punkty i przecięcia", modes: ["geometry", "mixed"], order: 317.85,
            help: "Kliknij środek i punkt promienia pierwszego okręgu, potem środek i punkt promienia drugiego."},
        {id: "geometry.circumcenter", commandId: "circumcenter", label: "Środek okręgu opisanego", group: "geometry-triangle-centers", groupLabel: "Szczególne punkty trójkąta", modes: ["geometry", "mixed"], order: 317.9,
            help: "Kliknij trzy różne, niewspółliniowe punkty trójkąta."},
        {id: "geometry.orthocenter", commandId: "orthocenter", label: "Ortocentrum", group: "geometry-triangle-centers", groupLabel: "Szczególne punkty trójkąta", modes: ["geometry", "mixed"], order: 317.95,
            help: "Kliknij trzy różne, niewspółliniowe punkty trójkąta."},
        {id: "geometry.nine_point_center", commandId: "nine_point_center", label: "Środek okręgu 9 punktów", group: "geometry-triangle-centers", groupLabel: "Szczególne punkty trójkąta", modes: ["geometry", "mixed"], order: 317.96,
            help: "Kliknij trzy różne, niewspółliniowe punkty trójkąta."},
        {id: "geometry.centroid", commandId: "centroid", label: "Środek ciężkości", group: "geometry-triangle-centers", groupLabel: "Szczególne punkty trójkąta", modes: ["geometry", "mixed"], order: 317.97,
            help: "Kliknij trzy różne punkty trójkąta."},
        {id: "geometry.incenter", commandId: "incenter", label: "Środek okręgu wpisanego", group: "geometry-triangle-centers", groupLabel: "Szczególne punkty trójkąta", modes: ["geometry", "mixed"], order: 317.98,
            help: "Kliknij trzy różne, niewspółliniowe punkty trójkąta."},
        {id: "geometry.excenter", commandId: "excenter", label: "Środek okręgu dopisanego", group: "geometry-triangle-centers", groupLabel: "Szczególne punkty trójkąta", modes: ["geometry", "mixed"], order: 317.985,
            help: "Wybierz wierzchołek A/B/C i kliknij trzy wierzchołki trójkąta."},
        {id: "geometry.reflection_across_line", commandId: "reflection_across_line", label: "Odbicie względem prostej", group: "geometry-transformations", groupLabel: "Przekształcenia", modes: ["geometry", "mixed"], order: 318,
            help: "Kliknij punkt odbijany, a następnie dwa punkty wyznaczające prostą odbicia."},
        {id: "geometry.rotation_around_point", commandId: "rotation_around_point", label: "Obrót wokół punktu", group: "geometry-transformations", groupLabel: "Przekształcenia", modes: ["geometry", "mixed"], order: 319,
            help: "Podaj kąt, kliknij punkt obracany, a następnie środek obrotu."},
        {id: "geometry.central_reflection", commandId: "central_reflection", label: "Symetria środkowa", group: "geometry-transformations", groupLabel: "Przekształcenia", modes: ["geometry", "mixed"], order: 319.25,
            help: "Kliknij punkt odbijany, a następnie środek symetrii."},
        {id: "geometry.homothety", commandId: "homothety", label: "Jednokładność", group: "geometry-transformations", groupLabel: "Przekształcenia", modes: ["geometry", "mixed"], order: 319.4,
            help: "Podaj współczynnik k, kliknij punkt, a następnie środek jednokładności."},
        {id: "geometry.translation_by_vector", commandId: "translation_by_vector", label: "Translacja o wektor", group: "geometry-transformations", groupLabel: "Przekształcenia", modes: ["geometry", "mixed"], order: 319.5,
            help: "Kliknij punkt przesuwany, a następnie początek i koniec wektora translacji."},
        {id: "geometry.segment", label: "Odcinek", group: "geometry-basic", groupLabel: "Obiekty podstawowe", modes: ["geometry", "mixed"], order: 320},
        {id: "geometry.circle", label: "Okrąg", group: "geometry-basic", groupLabel: "Obiekty podstawowe", modes: ["geometry", "mixed"], order: 330},
        {id: "geometry.polygon", label: "Wielokąt", group: "geometry-basic", groupLabel: "Obiekty podstawowe", modes: ["geometry", "mixed"], order: 340},
        {id: "plot.chart", label: "Wykres", group: "plot", groupLabel: "Wykresy", modes: ["plot"], order: 400},
    ];
    coreTools.forEach((tool) => registry.registerTool(tool, "core"));

    global.RouteEditorToolRegistry = registry;
    global.RouteEditorPlugins = Object.freeze({
        register: (plugin) => registry.registerPlugin(plugin),
        registerTool: (tool) => registry.registerTool(tool),
        getTool: (toolId) => registry.getTool(toolId),
        toolsForMode: (mode) => registry.toolsForMode(mode),
        registerObjectType: (definition) => registry.registerObjectType(definition),
        getObjectType: (typeId) => registry.getObjectType(typeId),
    });
}(window));
