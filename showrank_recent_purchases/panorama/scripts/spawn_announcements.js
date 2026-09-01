/**
 * Spawn & Farm Announcement Engine for Deadlock
 * Tracks jungle camps, breakables, bridge runes, and soul urn spawns.
 */
(function () {
    "use strict";

    var CONFIG = {
        enabled: true,
        showWarning: true,
        showSpawn: true,
        warnSecs: 15,
        durationSecs: 6.0,
        soundEnabled: true,
        soundEvent: "UI.RevealVote",
        pollInterval: 0.25
    };

    var EVENT_SCHEDULE = [
        { id: "weak_camps", name: "Weak Camps", initialTime: 120, repeatInterval: null },
        { id: "breakables", name: "Crates & Statues", initialTime: 180, repeatInterval: null },
        { id: "medium_camps", name: "Medium Camps", initialTime: 300, repeatInterval: null },
        { id: "bridge_buffs", name: "Bridge Buffs", initialTime: 300, repeatInterval: 300 },
        { id: "strong_camps", name: "Strong Camps", initialTime: 480, repeatInterval: null },
        { id: "sinners_sacrifice", name: "Sinner's Sacrifice", initialTime: 480, repeatInterval: null },
        { id: "soul_urn", name: "Soul Urn", initialTime: 600, repeatInterval: null, warnOnly: true }
    ];

    var STRINGS = {
        warning: "Spawning in {seconds}s",
        landing: "Landing in {seconds}s",
        available: "Available now"
    };

    var activeAlerts = {};
    var triggeredTriggers = {};
    var currentBanner = null;
    var lastClockTime = -1;
    var lastSoundTime = 0;
    var isInitialized = false;
    var urnDropState = { active: false, startTime: 0, urnId: 0, spawnReady: true };

    function isValid(panel) {
        return !!(panel && panel.IsValid && panel.IsValid());
    }

    function findChild(panel, childId) {
        if (!isValid(panel)) {
            return null;
        }
        if (panel.id === childId) {
            return panel;
        }
        if (panel.FindChildTraverse) {
            return panel.FindChildTraverse(childId);
        }
        return null;
    }

    function getNotificationRoot() {
        var context = $.GetContextPanel();
        var root = findChild(context, "SpawnNotificationRoot");
        if (!root) {
            root = findChild(context, "NotificationRoot");
        }
        if (!root) {
            root = findChild(context, "ShowRankBarebonesNotificationRoot");
        }
        if (!root && isValid(context)) {
            var curr = context;
            while (curr && curr.GetParent && curr.GetParent()) {
                curr = curr.GetParent();
            }
            root = findChild(curr, "SpawnNotificationRoot") || findChild(curr, "NotificationRoot");
        }
        return root;
    }

    function buildTimeline() {
        var timeline = {};
        var i, entry, t;
        for (i = 0; i < EVENT_SCHEDULE.length; i += 1) {
            entry = EVENT_SCHEDULE[i];
            if (entry.repeatInterval) {
                for (t = entry.initialTime; t <= 3600; t += entry.repeatInterval) {
                    if (!timeline[t]) {
                        timeline[t] = { trigger: t, items: [] };
                    }
                    timeline[t].items.push(entry);
                }
            } else {
                t = entry.initialTime;
                if (!timeline[t]) {
                    timeline[t] = { trigger: t, items: [] };
                }
                timeline[t].items.push(entry);
            }
        }
        return timeline;
    }

    var TIMELINE = buildTimeline();

    function formatCombinedTitles(items) {
        var names = [];
        var i, name;
        for (i = 0; i < items.length; i += 1) {
            name = items[i].name || items[i].id;
            if (names.indexOf(name) === -1) {
                names.push(name);
            }
        }
        if (names.length === 0) {
            return "";
        }
        if (names.length === 1) {
            return names[0];
        }
        if (names.length === 2) {
            return names[0] + " & " + names[1];
        }
        return names.join(", ");
    }

    function getOrCreateBanner() {
        if (currentBanner && isValid(currentBanner.panel)) {
            currentBanner.panel.RemoveClass("NotifExpired");
            currentBanner.panel.AddClass("NotifVisible");
            return currentBanner;
        }
        var root = getNotificationRoot();
        if (!root) {
            return null;
        }

        try {
            var children = root.Children ? root.Children() : [];
            if (children) {
                for (var j = 0; j < children.length; j += 1) {
                    if (isValid(children[j]) && children[j].BHasClass("GenericAnnouncement")) {
                        children[j].DeleteAsync(0);
                    }
                }
            }
        } catch (e) {}

        var panel = $.CreatePanel("Panel", root, "SpawnGenericAnnouncement");
        panel.AddClass("GenericAnnouncement");
        panel.hittest = false;

        var titleLabel = $.CreatePanel("Label", panel, "AnnouncementTitle");
        titleLabel.AddClass("AnnouncementTitle");

        var descLabel = $.CreatePanel("Label", panel, "AnnouncementDescription");
        descLabel.AddClass("AnnouncementDescription");

        currentBanner = {
            panel: panel,
            titleLabel: titleLabel,
            descLabel: descLabel
        };

        $.Schedule(0.03, function () {
            if (isValid(panel)) {
                panel.AddClass("NotifVisible");
            }
        });

        return currentBanner;
    }

    function dismissBanner() {
        if (currentBanner && isValid(currentBanner.panel)) {
            var p = currentBanner.panel;
            p.RemoveClass("NotifVisible");
            p.AddClass("NotifExpired");
            var bannerRef = currentBanner;
            $.Schedule(0.2, function () {
                if (currentBanner === bannerRef) {
                    currentBanner = null;
                }
                if (isValid(p)) {
                    p.DeleteAsync(0);
                }
            });
        }
    }

    function renderActiveAlerts() {
        var keys = Object.keys(activeAlerts);
        if (keys.length === 0) {
            dismissBanner();
            return;
        }

        var titles = [];
        var minWarningSecs = null;
        var minDescentSecs = null;
        var isSpawnPhase = false;
        var i, key, alert;

        for (i = 0; i < keys.length; i += 1) {
            key = keys[i];
            alert = activeAlerts[key];
            if (alert.title && titles.indexOf(alert.title) === -1) {
                titles.push(alert.title);
            }

            if (alert.phase === "spawn") {
                isSpawnPhase = true;
            } else if (alert.phase === "descent") {
                if (alert.seconds !== null && (minDescentSecs === null || alert.seconds < minDescentSecs)) {
                    minDescentSecs = alert.seconds;
                }
            } else if (alert.phase === "warn") {
                if (alert.seconds !== null && (minWarningSecs === null || alert.seconds < minWarningSecs)) {
                    minWarningSecs = alert.seconds;
                }
            }
        }

        if (titles.length === 0) {
            dismissBanner();
            return;
        }

        var combinedTitle = titles.length <= 2 ? titles.join(" & ") : titles.join(", ");
        var descText = "";

        if (minDescentSecs !== null) {
            descText = STRINGS.landing.replace("{seconds}", String(minDescentSecs));
        } else if (isSpawnPhase) {
            descText = STRINGS.available;
        } else if (minWarningSecs !== null) {
            descText = STRINGS.warning.replace("{seconds}", String(minWarningSecs));
        } else {
            descText = STRINGS.available;
        }

        var banner = getOrCreateBanner();
        if (!banner) {
            return;
        }

        if (banner.titleLabel.text !== combinedTitle) {
            banner.titleLabel.text = combinedTitle;
        }
        if (banner.descLabel.text !== descText) {
            banner.descLabel.text = descText;
        }
    }

    function cleanupExpiredAlerts() {
        var now = Date.now();
        var changed = false;
        var keys = Object.keys(activeAlerts);
        var i, key, alert;

        for (i = 0; i < keys.length; i += 1) {
            key = keys[i];
            alert = activeAlerts[key];
            if (alert.expireAt && now >= alert.expireAt) {
                delete activeAlerts[key];
                changed = true;
            }
        }

        if (changed) {
            renderActiveAlerts();
        }
    }

    function playSpawnSound() {
        if (!CONFIG.soundEnabled || !CONFIG.soundEvent) {
            return;
        }
        var now = Date.now();
        if (now - lastSoundTime < 500) {
            return;
        }
        lastSoundTime = now;
        try {
            $.DispatchEvent("PlaySoundEffect", CONFIG.soundEvent);
        } catch (e) {}
    }

    function triggerCountdown(key, title, seconds) {
        var existing = activeAlerts[key];
        if (existing && existing.phase === "warn") {
            existing.title = title;
            existing.seconds = seconds;
            existing.expireAt = Date.now() + 2500;
        } else {
            activeAlerts[key] = {
                title: title,
                phase: "warn",
                seconds: seconds,
                expireAt: Date.now() + 2500
            };
        }
        renderActiveAlerts();
    }

    function triggerSpawn(key, title) {
        activeAlerts[key] = {
            title: title,
            phase: "spawn",
            seconds: null,
            expireAt: Date.now() + CONFIG.durationSecs * 1000
        };
        playSpawnSound();
        renderActiveAlerts();
    }

    function triggerDescent(key, title, seconds) {
        activeAlerts[key] = {
            title: title,
            phase: "descent",
            seconds: seconds,
            expireAt: Date.now() + 2000
        };
        renderActiveAlerts();
    }

    function isHideout() {
        var context = $.GetContextPanel();
        if (!isValid(context)) {
            return false;
        }
        var hideoutClasses = [
            "connectedToHideout",
            "connectedtohideout",
            "connectedToHideOut"
        ];
        var i;
        try {
            if (context.BAscendantHasClass) {
                for (i = 0; i < hideoutClasses.length; i += 1) {
                    if (context.BAscendantHasClass(hideoutClasses[i])) {
                        return true;
                    }
                }
            }
        } catch (e) {}

        try {
            var curr = context;
            var depth = 0;
            while (curr && curr.GetParent && curr.GetParent() && depth < 64) {
                curr = curr.GetParent();
                depth += 1;
            }
            if (curr) {
                if (curr.BHasClass) {
                    for (i = 0; i < hideoutClasses.length; i += 1) {
                        if (curr.BHasClass(hideoutClasses[i])) {
                            return true;
                        }
                    }
                }
                var hud = curr.FindChildTraverse ? (curr.FindChildTraverse("Hud") || curr) : curr;
                if (hud && hud.BHasClass) {
                    for (i = 0; i < hideoutClasses.length; i += 1) {
                        if (hud.BHasClass(hideoutClasses[i])) {
                            return true;
                        }
                    }
                }
            }
        } catch (e) {}

        return false;
    }

    function readMatchClockSeconds() {
        if (isHideout()) {
            return null;
        }
        var context = $.GetContextPanel();
        var timeLabel = findChild(context, "GameTime");
        if (!isValid(timeLabel) || !timeLabel.text) {
            return null;
        }
        var rawText = String(timeLabel.text).replace(/<[^>]+>/g, "").trim();
        var match = rawText.match(/(?:(d+):)?(d{1,2}):(d{2})/);
        if (!match) {
            return null;
        }
        var hours = match[1] ? parseInt(match[1], 10) : 0;
        var mins = parseInt(match[2], 10);
        var secs = parseInt(match[3], 10);
        return hours * 3600 + mins * 60 + secs;
    }

    function pollUrnMinimapState(matchSeconds) {
        if (!CONFIG.enabled || !CONFIG.showSpawn) {
            return;
        }
        var context = $.GetContextPanel();
        var minimap = findChild(context, "hud_minimap") || findChild(context, "ObjectivesMap");
        if (!isValid(minimap)) {
            var curr = context;
            while (curr && curr.GetParent && curr.GetParent()) {
                curr = curr.GetParent();
            }
            minimap = findChild(curr, "hud_minimap") || findChild(curr, "map_render");
        }
        if (!isValid(minimap)) {
            return;
        }

        var idolSpawnNodes = [];
        try {
            if (minimap.FindChildrenWithClassTraverse) {
                idolSpawnNodes = minimap.FindChildrenWithClassTraverse("idol_spawn") || [];
            }
        } catch (e) {}

        var hasActiveSpawn = false;
        var i, node;
        for (i = 0; i < idolSpawnNodes.length; i += 1) {
            node = idolSpawnNodes[i];
            if (node && node.BHasClass && (node.BHasClass("active") || node.BHasClass("active_map_button") || (node.style && node.style.visibility !== "collapse"))) {
                hasActiveSpawn = true;
                break;
            }
        }

        if (hasActiveSpawn && urnDropState.spawnReady) {
            urnDropState.spawnReady = false;
            urnDropState.active = true;
            urnDropState.startTime = Date.now();
            urnDropState.urnId += 1;
            runUrnLandingSequence(urnDropState.urnId, matchSeconds);
        } else if (!hasActiveSpawn) {
            urnDropState.spawnReady = true;
        }
    }

    function runUrnLandingSequence(urnId, baseMatchSeconds) {
        var key = "soul_urn_live_" + urnId;
        var title = "Soul Urn";
        var startTime = Date.now();

        function step() {
            if (!CONFIG.enabled || urnDropState.urnId !== urnId) {
                return;
            }
            var currentSecs = readMatchClockSeconds();
            if (currentSecs === null || isHideout()) {
                if (activeAlerts[key]) {
                    delete activeAlerts[key];
                    renderActiveAlerts();
                }
                return;
            }
            var elapsed = baseMatchSeconds !== null ?
                (currentSecs - baseMatchSeconds) : ((Date.now() - startTime) / 1000);
            var remaining = Math.ceil(12 - elapsed);

            if (remaining > 0 && elapsed >= 0 && elapsed <= 25) {
                triggerDescent(key, title, remaining);
                $.Schedule(0.25, step);
            } else if (remaining <= 0 && elapsed <= 25) {
                triggerSpawn(key, title);
            } else {
                if (activeAlerts[key]) {
                    delete activeAlerts[key];
                    renderActiveAlerts();
                }
            }
        }

        step();
    }

    function checkTimelineTriggers(matchSeconds) {
        if (!CONFIG.enabled || matchSeconds === null || matchSeconds < 0) {
            return;
        }
        var triggers = Object.keys(TIMELINE);
        var i, trigTime, group, key, warnWindow, eligibleSpawns;

        for (i = 0; i < triggers.length; i += 1) {
            trigTime = parseInt(triggers[i], 10);
            group = TIMELINE[trigTime];
            key = "grp_" + trigTime;

            // If the event is in the past (more than 4s ago), mark as triggered and ensure no lingering alert
            if (matchSeconds > trigTime + 4) {
                triggeredTriggers[key + ":spawn"] = true;
                if (activeAlerts[key] && activeAlerts[key].phase === "warn") {
                    delete activeAlerts[key];
                }
                continue;
            }

            // Warning window (15s before spawn up to the exact spawn second)
            if (CONFIG.showWarning && CONFIG.warnSecs > 0) {
                warnWindow = trigTime - CONFIG.warnSecs;
                if (matchSeconds >= warnWindow && matchSeconds < trigTime && !triggeredTriggers[key + ":spawn"]) {
                    triggerCountdown(key, formatCombinedTitles(group.items), Math.max(1, trigTime - matchSeconds));
                }
            }

            // Spawn moment (strictly within [trigTime, trigTime + 4] seconds)
            if (matchSeconds >= trigTime && matchSeconds <= trigTime + 4 && !triggeredTriggers[key + ":spawn"]) {
                triggeredTriggers[key + ":spawn"] = true;
                if (CONFIG.showSpawn) {
                    eligibleSpawns = group.items.filter(function (it) { return !it.warnOnly; });
                    if (eligibleSpawns.length > 0) {
                        triggerSpawn(key, formatCombinedTitles(eligibleSpawns));
                    }
                }
            }
        }
    }

    function syncTriggersForTime(matchSeconds) {
        var triggers = Object.keys(TIMELINE);
        var i, t;
        for (i = 0; i < triggers.length; i += 1) {
            t = parseInt(triggers[i], 10);
            if (matchSeconds >= t) {
                triggeredTriggers["grp_" + t + ":spawn"] = true;
            } else {
                delete triggeredTriggers["grp_" + t + ":spawn"];
            }
        }
    }

    function onClockTick() {
        var context = $.GetContextPanel();
        if (!isValid(context)) {
            return;
        }

        if (isHideout()) {
            if (Object.keys(activeAlerts).length > 0 || currentBanner) {
                activeAlerts = {};
                triggeredTriggers = {};
                dismissBanner();
            }
            lastClockTime = -1;
            isInitialized = false;
            $.Schedule(CONFIG.pollInterval, onClockTick);
            return;
        }

        var matchSeconds = readMatchClockSeconds();
        if (matchSeconds !== null) {
            // Detect game start or time discontinuity (fast forward, scrub, or rewind)
            if (lastClockTime >= 0 && Math.abs(matchSeconds - lastClockTime) > 3) {
                activeAlerts = {};
                dismissBanner();
                syncTriggersForTime(matchSeconds);
            }

            if (!isInitialized) {
                isInitialized = true;
                syncTriggersForTime(matchSeconds);
            }

            lastClockTime = matchSeconds;
            checkTimelineTriggers(matchSeconds);
            pollUrnMinimapState(matchSeconds);
        } else {
            // No clock visible (loading, end screen, etc.)
            if (Object.keys(activeAlerts).length > 0 || currentBanner) {
                activeAlerts = {};
                triggeredTriggers = {};
                dismissBanner();
            }
            lastClockTime = -1;
            isInitialized = false;
        }

        cleanupExpiredAlerts();
        $.Schedule(CONFIG.pollInterval, onClockTick);
    }

    $.Schedule(0.5, onClockTick);
})();
