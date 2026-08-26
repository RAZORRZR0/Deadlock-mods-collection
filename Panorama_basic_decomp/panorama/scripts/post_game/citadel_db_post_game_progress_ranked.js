"use strict";
/// <reference path="../citadel.d.ts" />
/// <reference path="../async.ts" />
/// <reference path="./citadel_db_page_post_game_new.ts" />
let gProgressSequence = null;
function CompareRanks(left, right) {
    if (left.packedRank < right.packedRank)
        return -1;
    if (left.packedRank > right.packedRank)
        return 1;
    return 0;
}
function AreRanksEqual(left, right) {
    return CompareRanks(left, right) == 0;
}
function ExtractPackedRank(packedRank) {
    let rankNum = Math.trunc(packedRank / 10.0);
    let subRankNum = Math.trunc(packedRank % 10.0);
    return { rank: rankNum, subRank: subRankNum };
}
function GetLowerRank(unpacked) {
    if (unpacked.rank == 1 /* CitadelBadgeRank_t.Citadel_Rank1 */ && unpacked.subRank == 1 /* CitadelBadgeSubRank_t.Citadel_SubRank1 */)
        return undefined;
    if (unpacked.subRank == 1 /* CitadelBadgeSubRank_t.Citadel_SubRank1 */)
        return { rank: unpacked.rank - 1, subRank: 6 /* CitadelBadgeSubRank_t.Citadel_SubRankMax */ };
    return { rank: unpacked.rank, subRank: unpacked.subRank - 1 };
}
function GetHigherRank(unpacked) {
    if (unpacked.rank == 11 /* CitadelBadgeRank_t.Citadel_RankMax */ && unpacked.subRank == 6 /* CitadelBadgeSubRank_t.Citadel_SubRankMax */)
        return undefined;
    if (unpacked.subRank == 6 /* CitadelBadgeSubRank_t.Citadel_SubRankMax */)
        return { rank: unpacked.rank + 1, subRank: 1 /* CitadelBadgeSubRank_t.Citadel_SubRank1 */ };
    return { rank: unpacked.rank, subRank: unpacked.subRank + 1 };
}
function GetLowerRankInfo(rankInfo) {
    if (!rankInfo)
        return undefined;
    if (rankInfo.rank == 1 /* CitadelBadgeRank_t.Citadel_Rank1 */ && rankInfo.subRank == 1 /* CitadelBadgeSubRank_t.Citadel_SubRank1 */)
        return undefined;
    let screen = $.GetContextPanel();
    return screen.GetProgressRankInfo(rankInfo.flatProgress - 1);
}
function GetHigherRankInfo(rankInfo) {
    if (!rankInfo)
        return undefined;
    if (rankInfo.rank == 11 /* CitadelBadgeRank_t.Citadel_RankMax */ && rankInfo.subRank == 6 /* CitadelBadgeSubRank_t.Citadel_SubRankMax */)
        return undefined;
    let screen = $.GetContextPanel();
    return screen.GetProgressRankInfo(rankInfo.flatProgress + rankInfo.levelProgress);
}
function Ranked_AnimateProgressScreen(progressDataString) {
    let progressData = JSON.parse(progressDataString);
    Ranked_DoProgressAnimation(progressData);
}
function SetupRankChange(screen, rankChange) {
    let rankChangePrefix = rankChange >= 0 ? "+" : "-";
    let rankChangeAbs = Math.abs(rankChange);
    screen.SetDialogVariable("rank_change_prefix", rankChangePrefix);
    screen.SetDialogVariableInt("rank_change", rankChangeAbs);
    if (rankChange > 0) {
        screen.SwitchClass("rank_change_type", "GainedRank");
    }
    else if (rankChange < 0) {
        screen.SwitchClass("rank_change_type", "LostRank");
    }
    else {
        screen.SwitchClass("rank_change_type", "NoRankChange");
    }
}
function Ranked_ResetScreen() {
    let screen = $.GetContextPanel();
    let rankBadges = screen.FindChildInLayoutFile("RankBadges");
    let rankEffects = screen.FindChildInLayoutFile("RankEffects");
    // Reset the controls
    rankBadges.RemoveAndDeleteChildren();
    screen.RemoveClass('ShowCalibrating');
    screen.RemoveClass('ShowRankReceived');
    screen.SwitchClass("received_class", "");
    screen.RemoveClass('ShowWinStreak');
    for (let i = 0; i < rankEffects.GetChildCount(); ++i) {
        let scenePanel = rankEffects.GetChild(i);
        scenePanel.StopParticlesImmediately(true);
    }
}
function Ranked_PlayScenePanelEffect(strPanelID) {
    let screen = $.GetContextPanel();
    let rankEffects = screen.FindChildInLayoutFile("RankEffects");
    // Stop any existing effects
    for (let i = 0; i < rankEffects.GetChildCount(); ++i) {
        let scenePanel = rankEffects.GetChild(i);
        scenePanel.StopParticlesWithEndcaps(true);
    }
    let scenePanel = rankEffects.FindChildInLayoutFile(strPanelID);
    scenePanel.AddClass("ShowEffects");
    scenePanel.StartParticles();
    $.Schedule(5.0, function () { scenePanel.RemoveClass("ShowEffects"); });
}
async function Ranked_AnimateRankReceived(rankInfo, reason) {
    let sequence = gProgressSequence;
    let screen = $.GetContextPanel();
    let rankReceivedBadge = screen.FindChildInLayoutFile("RankReceivedBadge");
    let rankEffects = screen.FindChildInLayoutFile("RankEffects");
    let bTreatAsRankUp = false;
    switch (reason) {
        case 0 /* ERankReceivedReason.k_eCalibrated */:
            screen.SwitchClass("received_class", "RankReceived_Calibrated");
            screen.SetDialogVariableLocString("rank_received_title", "#Citadel_RankedProgress_CalibratedRank");
            bTreatAsRankUp = true;
            break;
        case 1 /* ERankReceivedReason.k_eGainedRank */:
            screen.SwitchClass("received_class", "RankReceived_GainedRank");
            screen.SetDialogVariableLocString("rank_received_title", "#Citadel_RankedProgress_GainedRank");
            bTreatAsRankUp = true;
            break;
        case 2 /* ERankReceivedReason.k_eLostRank */:
            screen.SwitchClass("received_class", "RankReceived_LostRank");
            screen.SetDialogVariableLocString("rank_received_title", "#Citadel_RankedProgress_LostRank");
            break;
    }
    screen.SetDialogVariableInt("packed_rank_received", rankInfo.packedRank);
    rankReceivedBadge.packedRank = rankInfo.packedRank;
    screen.PlayRankRevealMusic(rankInfo.rank, rankInfo.subRank, bTreatAsRankUp);
    if (bTreatAsRankUp) {
        if (rankInfo.subRank == 1 /* CitadelBadgeSubRank_t.Citadel_SubRank1 */) {
            Ranked_PlayScenePanelEffect('RankUpEffects');
        }
        else {
            Ranked_PlayScenePanelEffect('SubRankUpEffects');
        }
    }
    else {
        Ranked_PlayScenePanelEffect('RankDownEffects');
    }
    screen.AddClass("ShowRankReceived");
    await sequence.Delay(3.0);
    screen.RemoveClass("ShowRankReceived");
}
async function Ranked_AnimateCalibration(progressData) {
    let sequence = gProgressSequence;
    let screen = $.GetContextPanel();
    let player = progressData.local_player;
    let rankData = player.player_rank_data;
    let calibratingPips = screen.FindChildInLayoutFile('CalibratingPips');
    let rankBadges = screen.FindChildInLayoutFile("RankBadges");
    // Setup the initial state
    screen.AddClass('ShowCalibrating');
    let centerBadge = CreateRankBadgePanel(rankBadges, { rank: 0, subRank: 0 });
    centerBadge?.AddClass("Center");
    // Now do the animation
    await sequence.Delay(2.0);
    // Find the first pip that is not highlighted. Add a class to highlight it.
    for (let i = 0; i < calibratingPips.GetChildCount(); ++i) {
        let pip = calibratingPips.GetChild(i);
        if (pip.BHasClass('MatchFinished'))
            continue;
        pip.AddClass('MatchHighlighted');
        let nHighlightSound = PlayUISoundEvent("UI.Ranked.Calibration.Progress");
        await sequence.Delay(1.0);
        StopUISoundEvent(nHighlightSound);
        pip.RemoveClass('MatchHighlighted');
        pip.AddClass('MatchCompleted');
        PlayUISoundEvent("UI.Ranked.Calibration.Complete");
        await sequence.Delay(1.0);
        break;
    }
    // If this was the last calibration match, show the rank you just received
    if (rankData.initial_calibration_games == 1) {
        let receivedRankInfo = screen.GetProgressRankInfo(rankData.final_flat_progress);
        if (receivedRankInfo) {
            // setup the display to the normal view so you can see the progress bar after we're done with the popup.
            // this assumes that your initial calibration rank will not be a leaderboard rank
            let progressBar = screen.FindChildInLayoutFile("RankProgressBar");
            let lowerRankInfo = GetLowerRankInfo(receivedRankInfo);
            let higherRankInfo = GetHigherRankInfo(receivedRankInfo);
            centerBadge?.DeleteAsync(0.0);
            centerBadge = CreateRankInfoBadgePanel(rankBadges, receivedRankInfo);
            let leftBadge = CreateRankInfoBadgePanel(rankBadges, lowerRankInfo);
            let rightBadge = CreateRankInfoBadgePanel(rankBadges, higherRankInfo);
            leftBadge?.SwitchClass("rank_class", "Left");
            centerBadge?.SwitchClass("rank_class", "Center");
            rightBadge?.SwitchClass("rank_class", "Right");
            let receivedRankProgress = rankData.final_flat_progress - receivedRankInfo.flatProgress;
            progressBar.min = 0;
            progressBar.max = receivedRankInfo.levelProgress;
            progressBar.lowervalue = receivedRankProgress;
            progressBar.uppervalue = receivedRankProgress;
            screen.SetDialogVariableInt("current_rank_progress", receivedRankProgress);
            screen.SetDialogVariableInt("max_rank_progress", receivedRankInfo.levelProgress);
            SetupRankChange(screen, 0);
            sequence.EndSkipping();
            await Ranked_AnimateRankReceived(receivedRankInfo, 0 /* ERankReceivedReason.k_eCalibrated */);
            screen.RemoveClass('ShowCalibrating');
            await sequence.Delay(2.0);
        }
    }
}
function StartProgressTickingSound(progressChange) {
    if (progressChange > 0) {
        return PlayUISoundEvent("UI.Ranked.ProgressUp");
    }
    else if (progressChange < 0) {
        return PlayUISoundEvent("UI.Ranked.ProgressDown");
    }
    return 0;
}
async function Ranked_AnimateRankProgress(progressData) {
    let sequence = gProgressSequence;
    let screen = $.GetContextPanel();
    let progressBar = screen.FindChildInLayoutFile("RankProgressBar");
    let rankBadges = screen.FindChildInLayoutFile("RankBadges");
    let player = progressData.local_player;
    let rankData = player.player_rank_data;
    let initialRankInfo = screen.GetProgressRankInfo(rankData.initial_flat_progress);
    let initialRankProgress = rankData.initial_flat_progress - initialRankInfo.flatProgress;
    let leftBadge = undefined;
    let centerBadge = undefined;
    let rightBadge = undefined;
    // Setup the initial state
    if (!initialRankInfo.bLeaderboardPlacement) {
        // Default case - a progress rank. Show the progress bar
        screen.RemoveClass("ShowingLeaderboardRank");
        progressBar.min = 0;
        progressBar.max = initialRankInfo.levelProgress;
        progressBar.lowervalue = initialRankProgress;
        progressBar.uppervalue = initialRankProgress;
        screen.SetDialogVariableInt("current_rank_progress", initialRankProgress);
        screen.SetDialogVariableInt("max_rank_progress", initialRankInfo.levelProgress);
        let lowerRankInfo = GetLowerRankInfo(initialRankInfo);
        let higherRankInfo = GetHigherRankInfo(initialRankInfo);
        leftBadge = CreateRankInfoBadgePanel(rankBadges, lowerRankInfo);
        centerBadge = CreateRankInfoBadgePanel(rankBadges, initialRankInfo);
        rightBadge = CreateRankInfoBadgePanel(rankBadges, higherRankInfo);
    }
    else {
        // A leaderboard rank - show the badge from the passed in display rank, and just show the rank points instead of a progress bar
        screen.AddClass("ShowingLeaderboardRank");
        screen.SetDialogVariableInt("leaderboard_packed_rank", initialRankInfo.packedRank);
        screen.SetDialogVariableInt("current_rank_progress", initialRankProgress);
        let initial = ExtractPackedRank(rankData.initial_display_rank);
        let lower = GetLowerRank(initial);
        let higher = GetHigherRank(initial);
        leftBadge = CreateRankBadgePanel(rankBadges, lower);
        centerBadge = CreateRankBadgePanel(rankBadges, initial);
        rightBadge = CreateRankBadgePanel(rankBadges, higher);
    }
    SetupRankChange(screen, rankData.desired_progress_change);
    let lowerRankInfo = GetLowerRankInfo(initialRankInfo);
    let higherRankInfo = GetHigherRankInfo(initialRankInfo);
    leftBadge?.SwitchClass("rank_class", "Left");
    centerBadge?.SwitchClass("rank_class", "Center");
    rightBadge?.SwitchClass("rank_class", "Right");
    // Now do the animation
    await sequence.Delay(1.0);
    leftBadge?.AddClass('Animate');
    centerBadge?.AddClass('Animate');
    rightBadge?.AddClass('Animate');
    // See if they got a win streak. If so, animate that appearing
    if (screen.BHasClass('HasWinStreakBonus')) {
        screen.AddClass('ShowWinStreak');
        PlayUISoundEvent("UI.Ranked.WinStreak.Appear");
        await sequence.Delay(1.0);
    }
    // Animate receiving the progress
    const progressAnimDefaultDuration = 1.0;
    // Adjust the duration so that if we were clamped it doesn't take as long
    let progressChange = rankData.final_flat_progress - rankData.initial_flat_progress;
    let progressChangeAbs = Math.abs(progressChange);
    let progressAnimDuration = progressAnimDefaultDuration * (progressChangeAbs / 250.0);
    // Start a ticking sound
    let nProgressSound = StartProgressTickingSound(progressChange);
    let progressAnimElapsed = 0.0;
    let prevRankInfo = initialRankInfo;
    let prevFrameTime = $.FrameTime();
    while (progressAnimElapsed < progressAnimDuration) {
        await sequence.Delay(0.0);
        let frameTime = $.FrameTime();
        progressAnimElapsed += frameTime - prevFrameTime;
        prevFrameTime = frameTime;
        // If skipping, just slam to the final value.
        if (sequence.IsSkipping()) {
            progressAnimElapsed = progressAnimDuration;
        }
        let progressPercent = progressAnimElapsed / progressAnimDuration;
        let currentFlatProgress = rankData.initial_flat_progress + progressPercent * (rankData.final_flat_progress - rankData.initial_flat_progress);
        if (rankData.final_flat_progress > rankData.initial_flat_progress) {
            currentFlatProgress = Math.min(currentFlatProgress, rankData.final_flat_progress);
        }
        else {
            currentFlatProgress = Math.max(currentFlatProgress, rankData.final_flat_progress);
        }
        let newRankInfo = screen.GetProgressRankInfo(currentFlatProgress);
        let compare = CompareRanks(prevRankInfo, newRankInfo);
        if (compare != 0) {
            // Stop the ticking
            if (nProgressSound != 0) {
                StopUISoundEvent(nProgressSound);
                nProgressSound = 0;
            }
            sequence.EndSkipping();
            if (compare < 0) {
                // Gained a rank. Force the progress bar to show the max of the previous rank
                progressBar.min = 0;
                progressBar.lowervalue = AreRanksEqual(prevRankInfo, initialRankInfo) ? (rankData.initial_flat_progress - initialRankInfo.flatProgress) : 0;
                progressBar.uppervalue = prevRankInfo.levelProgress;
                progressBar.max = prevRankInfo.levelProgress;
                screen.SetDialogVariableInt("current_rank_progress", prevRankInfo.levelProgress);
                screen.SetDialogVariableInt("max_rank_progress", prevRankInfo.levelProgress);
                await Ranked_AnimateRankReceived(newRankInfo, 1 /* ERankReceivedReason.k_eGainedRank */);
                let higherRankInfo = GetHigherRankInfo(newRankInfo);
                // Animate the badges to the left
                leftBadge?.SwitchClass("rank_class", "ExitLeft");
                leftBadge?.DeleteAsync(1.0);
                centerBadge?.SwitchClass("rank_class", "Left");
                leftBadge = centerBadge;
                rightBadge?.SwitchClass("rank_class", "Center");
                centerBadge = rightBadge;
                rightBadge = CreateRankInfoBadgePanel(rankBadges, higherRankInfo);
                rightBadge?.SwitchClass("rank_class", "ExitRight");
                rightBadge?.ApplyStyles(false);
                rightBadge?.AddClass('Animate');
                rightBadge?.ApplyStyles(false);
                rightBadge?.SwitchClass("rank_class", "Right");
                PlayUISoundEvent("UI.Ranked.Change");
            }
            else {
                // Lost a rank. Force the progress bar to show the min of the previous rank
                progressBar.min = 0;
                progressBar.lowervalue = 0;
                progressBar.uppervalue = AreRanksEqual(prevRankInfo, initialRankInfo) ? (rankData.initial_flat_progress - initialRankInfo.flatProgress) : prevRankInfo.levelProgress;
                progressBar.max = prevRankInfo.levelProgress;
                screen.SetDialogVariableInt("current_rank_progress", 0);
                screen.SetDialogVariableInt("max_rank_progress", prevRankInfo.levelProgress);
                await Ranked_AnimateRankReceived(newRankInfo, 2 /* ERankReceivedReason.k_eLostRank */);
                let lowerRankInfo = GetLowerRankInfo(newRankInfo);
                // Animate the badges to the right
                rightBadge?.SwitchClass("rank_class", "ExitRight");
                rightBadge?.DeleteAsync(1.0);
                centerBadge?.SwitchClass("rank_class", "Right");
                rightBadge = centerBadge;
                leftBadge?.SwitchClass("rank_class", "Center");
                centerBadge = leftBadge;
                leftBadge = CreateRankInfoBadgePanel(rankBadges, lowerRankInfo);
                leftBadge?.SwitchClass("rank_class", "ExitLeft");
                leftBadge?.ApplyStyles(false);
                leftBadge?.AddClass('Animate');
                leftBadge?.ApplyStyles(false);
                leftBadge?.SwitchClass("rank_class", "Left");
            }
            await sequence.Delay(1.0);
            // Resume the ticking sound if we have more progress to go
            if (currentFlatProgress != rankData.final_flat_progress) {
                nProgressSound = StartProgressTickingSound(progressChange);
            }
            prevFrameTime = $.FrameTime();
        }
        let progressInRank = currentFlatProgress - newRankInfo.flatProgress;
        if (!newRankInfo.bLeaderboardPlacement) {
            screen.RemoveClass("ShowingLeaderboardRank");
            progressBar.min = 0;
            progressBar.max = newRankInfo.levelProgress;
            if (AreRanksEqual(initialRankInfo, newRankInfo)) {
                if (rankData.final_flat_progress > rankData.initial_flat_progress) {
                    progressBar.lowervalue = rankData.initial_flat_progress - newRankInfo.flatProgress;
                    progressBar.uppervalue = progressInRank;
                }
                else {
                    progressBar.lowervalue = progressInRank;
                    progressBar.uppervalue = rankData.initial_flat_progress - newRankInfo.flatProgress;
                }
            }
            else {
                if (rankData.final_flat_progress > rankData.initial_flat_progress) {
                    progressBar.lowervalue = 0;
                    progressBar.uppervalue = progressInRank;
                }
                else {
                    progressBar.lowervalue = progressInRank;
                    progressBar.uppervalue = newRankInfo.levelProgress;
                }
            }
            screen.SetDialogVariableInt("current_rank_progress", progressInRank);
            screen.SetDialogVariableInt("max_rank_progress", newRankInfo.levelProgress);
        }
        else {
            screen.AddClass("ShowingLeaderboardRank");
            screen.SetDialogVariableInt("leaderboard_packed_rank", initialRankInfo.packedRank);
            screen.SetDialogVariableInt("current_rank_progress", progressInRank);
        }
        prevRankInfo = newRankInfo;
    }
    // Stop ticking
    if (nProgressSound != 0) {
        StopUISoundEvent(nProgressSound);
        nProgressSound = 0;
    }
    sequence.EndSkipping();
    if (rankData.consumed_demotion_protection) {
        let demotionPips = screen.FindChildInLayoutFile('DemotionProtectionPips');
        for (let i = demotionPips.GetChildCount() - 1; i >= 0; --i) {
            let pip = demotionPips.GetChild(i);
            if (!pip.BHasClass("Used")) {
                Ranked_PlayScenePanelEffect('RankLossPreventionEffects');
                PlayUISoundEvent('UI.Ranked.RankProtected');
                pip.AddClass("Highlighted");
                await sequence.Delay(1.0);
                pip.RemoveClass("Highlighted");
                pip.AddClass("Used");
                break;
            }
        }
        screen.SetDialogVariableInt("demotion_protection_remaining", rankData.initial_demotion_protection_games - 1);
    }
}
async function Ranked_DoProgressAnimation(progressData) {
    if (gProgressSequence && !gProgressSequence.IsFinished())
        gProgressSequence.Abort();
    gProgressSequence = new Async.SequenceController();
    let screen = $.GetContextPanel();
    Ranked_ResetScreen();
    let player = progressData.local_player;
    if (!player.player_rank_data) {
        $.Msg("Missing rank data!");
        screen.NotifyFinishedAnimating();
        return;
    }
    let rankData = player.player_rank_data;
    if (rankData.initial_calibration_games > 0) {
        await Ranked_AnimateCalibration(progressData);
    }
    else {
        await Ranked_AnimateRankProgress(progressData);
    }
    await gProgressSequence.Delay(2.0);
    screen.NotifyFinishedAnimating();
}
function Ranked_SkipForward() {
    if (!gProgressSequence)
        return;
    gProgressSequence.Skip();
}
function CreateRankBadgePanel(parent, unpacked) {
    if (!unpacked)
        return undefined;
    return $.CreatePanel('CitadelRankedBadgeFull', parent, "", { class: "RankBadge", rank: unpacked.rank, subrank: unpacked.subRank });
}
function CreateRankInfoBadgePanel(parent, rankInfo) {
    if (!rankInfo)
        return undefined;
    return CreateRankBadgePanel(parent, { rank: rankInfo.rank, subRank: rankInfo.subRank });
}
function Ranked_ShowScreenNoAnimation(progressDataString) {
    let progressData = JSON.parse(progressDataString);
    let screen = $.GetContextPanel();
    let progressBar = screen.FindChildInLayoutFile("RankProgressBar");
    let rankBadges = screen.FindChildInLayoutFile("RankBadges");
    Ranked_ResetScreen();
    let player = progressData.local_player;
    if (!player.player_rank_data) {
        $.Msg("Missing rank data!");
        return;
    }
    let rankData = player.player_rank_data;
    if (rankData.initial_calibration_games > 1) {
        let calibratingPips = screen.FindChildInLayoutFile('CalibratingPips');
        screen.AddClass('ShowCalibrating');
        // Find the first pip that is not highlighted. Add a class to highlight it.
        for (let i = 0; i < calibratingPips.GetChildCount(); ++i) {
            let pip = calibratingPips.GetChild(i);
            if (pip.BHasClass('MatchFinished'))
                continue;
            pip.AddClass('MatchCompleted');
            break;
        }
        let centerBadge = CreateRankBadgePanel(rankBadges, { rank: 0, subRank: 0 });
        centerBadge?.AddClass("Center");
        return;
    }
    let finalRankInfo = screen.GetProgressRankInfo(rankData.final_flat_progress);
    let initialRankInfo;
    if (rankData.initial_calibration_games == 1) {
        // If this is the final game before calibration, then we won't have an initial rank. So just set it to the final rank.
        initialRankInfo = finalRankInfo;
    }
    else {
        initialRankInfo = screen.GetProgressRankInfo(rankData.initial_flat_progress);
    }
    let finalProgressInRank = rankData.final_flat_progress - finalRankInfo.flatProgress;
    SetupRankChange(screen, rankData.desired_progress_change);
    if (screen.BHasClass('HasWinStreakBonus')) {
        screen.AddClass('ShowWinStreak');
    }
    let leftBadge = undefined;
    let centerBadge = undefined;
    let rightBadge = undefined;
    if (finalRankInfo.bLeaderboardPlacement) {
        screen.AddClass("ShowingLeaderboardRank");
        screen.SetDialogVariableInt("current_rank_progress", finalProgressInRank);
        // For leaderboard ranks, we assume that unless you deranked into a non-leaderboard rank,
        // your badge won't have changed since that happens async
        let initial = ExtractPackedRank(rankData.initial_display_rank);
        let lower = GetLowerRank(initial);
        let higher = GetHigherRank(initial);
        leftBadge = CreateRankBadgePanel(rankBadges, lower);
        centerBadge = CreateRankBadgePanel(rankBadges, initial);
        rightBadge = CreateRankBadgePanel(rankBadges, higher);
    }
    else {
        screen.RemoveClass("ShowingLeaderboardRank");
        progressBar.min = 0;
        progressBar.max = finalRankInfo.levelProgress;
        if (AreRanksEqual(initialRankInfo, finalRankInfo)) {
            if (rankData.final_flat_progress > rankData.initial_flat_progress) {
                progressBar.lowervalue = rankData.initial_flat_progress - finalRankInfo.flatProgress;
                progressBar.uppervalue = finalProgressInRank;
            }
            else {
                progressBar.lowervalue = finalProgressInRank;
                progressBar.uppervalue = rankData.initial_flat_progress - finalRankInfo.flatProgress;
            }
        }
        else {
            if (rankData.final_flat_progress > rankData.initial_flat_progress) {
                progressBar.lowervalue = 0;
                progressBar.uppervalue = finalProgressInRank;
            }
            else {
                progressBar.lowervalue = finalProgressInRank;
                progressBar.uppervalue = finalRankInfo.levelProgress;
            }
        }
        screen.SetDialogVariableInt("current_rank_progress", finalProgressInRank);
        screen.SetDialogVariableInt("max_rank_progress", finalRankInfo.levelProgress);
        let lowerRankInfo = GetLowerRankInfo(finalRankInfo);
        let higherRankInfo = GetHigherRankInfo(finalRankInfo);
        leftBadge = CreateRankInfoBadgePanel(rankBadges, lowerRankInfo);
        centerBadge = CreateRankInfoBadgePanel(rankBadges, finalRankInfo);
        rightBadge = CreateRankInfoBadgePanel(rankBadges, higherRankInfo);
    }
    leftBadge?.AddClass("Left");
    centerBadge?.AddClass("Center");
    rightBadge?.AddClass("Right");
    if (rankData.consumed_demotion_protection) {
        let demotionPips = screen.FindChildInLayoutFile('DemotionProtectionPips');
        for (let i = demotionPips.GetChildCount() - 1; i >= 0; --i) {
            let pip = demotionPips.GetChild(i);
            if (!pip.BHasClass("Used")) {
                pip.AddClass("Used");
                break;
            }
        }
        screen.SetDialogVariableInt("demotion_protection_remaining", rankData.initial_demotion_protection_games - 1);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2l0YWRlbF9kYl9wb3N0X2dhbWVfcHJvZ3Jlc3NfcmFua2VkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vLi4vY29udGVudC9jaXRhZGVsL3Bhbm9yYW1hL3NjcmlwdHMvcG9zdF9nYW1lL2NpdGFkZWxfZGJfcG9zdF9nYW1lX3Byb2dyZXNzX3JhbmtlZC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUEsd0NBQXdDO0FBQ3hDLG9DQUFvQztBQUNwQywyREFBMkQ7QUFFM0QsSUFBSSxpQkFBaUIsR0FBb0MsSUFBSSxDQUFDO0FBa0I5RCxTQUFTLFlBQVksQ0FBRSxJQUF3QixFQUFFLEtBQXlCO0lBRXRFLElBQUssSUFBSSxDQUFDLFVBQVUsR0FBRyxLQUFLLENBQUMsVUFBVTtRQUNuQyxPQUFPLENBQUMsQ0FBQyxDQUFDO0lBQ2QsSUFBSyxJQUFJLENBQUMsVUFBVSxHQUFHLEtBQUssQ0FBQyxVQUFVO1FBQ25DLE9BQU8sQ0FBQyxDQUFDO0lBRWIsT0FBTyxDQUFDLENBQUM7QUFDYixDQUFDO0FBRUQsU0FBUyxhQUFhLENBQUUsSUFBd0IsRUFBRSxLQUF5QjtJQUV2RSxPQUFPLFlBQVksQ0FBRSxJQUFJLEVBQUUsS0FBSyxDQUFFLElBQUksQ0FBQyxDQUFDO0FBQzVDLENBQUM7QUFFRCxTQUFTLGlCQUFpQixDQUFFLFVBQWtCO0lBRTFDLElBQUksT0FBTyxHQUFXLElBQUksQ0FBQyxLQUFLLENBQUUsVUFBVSxHQUFHLElBQUksQ0FBRSxDQUFDO0lBQ3RELElBQUksVUFBVSxHQUFXLElBQUksQ0FBQyxLQUFLLENBQUUsVUFBVSxHQUFHLElBQUksQ0FBRSxDQUFDO0lBQ3pELE9BQU8sRUFBRSxJQUFJLEVBQUUsT0FBTyxFQUFFLE9BQU8sRUFBRSxVQUFVLEVBQUUsQ0FBQztBQUNsRCxDQUFDO0FBRUQsU0FBUyxZQUFZLENBQUUsUUFBd0I7SUFFM0MsSUFBSyxRQUFRLENBQUMsSUFBSSw0Q0FBb0MsSUFBSSxRQUFRLENB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