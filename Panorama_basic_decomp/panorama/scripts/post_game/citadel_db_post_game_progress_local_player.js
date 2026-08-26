"use strict";
/// <reference path="../citadel.d.ts" />
/// <reference path="../async.ts" />
let gProgressSequence = null;
function LocalPlayer_AnimateProgressScreen() {
    LocalPlayer_DoProgressAnimation();
}
async function LocalPlayer_DoProgressAnimation() {
    if (gProgressSequence && !gProgressSequence.IsFinished())
        gProgressSequence.Abort();
    gProgressSequence = new Async.SequenceController();
    let screen = $.GetContextPanel();
    let playerHeroXPRewards = screen.FindChildInLayoutFile("HeroXPRewards");
    let progressBar = screen.FindChildInLayoutFile("HeroLevelProgressBar");
    let nextLevelProgressBar = screen.FindChildInLayoutFile("NextLevelProgressBar");
    let heroBadge = screen.FindChildInLayoutFile("HeroBadge");
    let nextHeroBadgeIcon = screen.FindChildInLayoutFile("NextHeroBadgeIcon");
    // Reset to the initial state
    screen.RemoveClass('ShowPlayerHero');
    for (let i = 0; i < playerHeroXPRewards.GetChildCount(); ++i) {
        playerHeroXPRewards.GetChild(i).RemoveClass('ShowHeroXPReward');
    }
    let unCurrentHeroXP = screen.GetAttributeInt("current_hero_xp", 0);
    let unNextLevelXP = screen.GetAttributeInt("next_level_xp", 0);
    // Now do the actual sequence
    screen.AddClass('ShowPlayerHero');
    await gProgressSequence.Delay(2.0);
    let bLeveledUp = false;
    let totalXpAmount = 0;
    for (let i = 0; i < playerHeroXPRewards.GetChildCount(); ++i) {
        let heroxpRewardPanel = playerHeroXPRewards.GetChild(i);
        let xpAmount = heroxpRewardPanel.GetAttributeInt("reward_amount", 0);
        heroxpRewardPanel.AddClass('ShowHeroXPReward');
        PlayUISoundEvent("UI.PostGame.HeroXPReward");
        let nTicks = Math.min(25, xpAmount);
        for (let nTick = 0; nTick < nTicks; ++nTick) {
            let progressXP = unCurrentHeroXP + totalXpAmount + ((nTick + 1.0) / nTicks) * xpAmount;
            if (progressXP > unNextLevelXP && !bLeveledUp) {
                progressXP = unNextLevelXP;
                bLeveledUp = true;
                PlayUISoundEvent("UI.PostGame.HeroXPReward_LevelUp");
                heroBadge.heroxp = unNextLevelXP;
                heroBadge.AddClass("LevelUp");
                nextHeroBadgeIcon.AddClass("LevelUp");
                await gProgressSequence.Delay(1.0);
                nextHeroBadgeIcon.RemoveClass("LevelUp");
                heroBadge.RemoveClass("LevelUp");
            }
            PlayUISoundEvent("UI.PostGame.HeroXPReward_Tick");
            progressBar.uppervalue = progressXP;
            nextLevelProgressBar.value = progressXP;
            await gProgressSequence.Delay(0.01);
        }
        totalXpAmount += xpAmount;
        progressBar.uppervalue = unCurrentHeroXP + totalXpAmount;
        await gProgressSequence.Delay(0.5);
    }
    gProgressSequence.EndSkipping();
    if (bLeveledUp) {
        await gProgressSequence.Delay(3.0);
    }
    else {
        await gProgressSequence.Delay(1.5);
    }
    screen.NotifyFinishedAnimating();
}
function LocalPlayer_SkipForward() {
    if (!gProgressSequence)
        return;
    gProgressSequence.Skip();
}
function LocalPlayer_ShowScreenNoAnimation() {
    let screen = $.GetContextPanel();
    let playerHeroXPRewards = screen.FindChildInLayoutFile("HeroXPRewards");
    let progressBar = screen.FindChildInLayoutFile("HeroLevelProgressBar");
    let nextLevelProgressBar = screen.FindChildInLayoutFile("NextLevelProgressBar");
    let heroBadge = screen.FindChildInLayoutFile("HeroBadge");
    let unCurrentHeroXP = screen.GetAttributeInt("current_hero_xp", 0);
    screen.AddClass('ShowPlayerHero');
    let totalXpAmount = 0;
    for (let i = 0; i < playerHeroXPRewards.GetChildCount(); ++i) {
        let heroxpRewardPanel = playerHeroXPRewards.GetChild(i);
        let xpAmount = heroxpRewardPanel.GetAttributeInt("reward_amount", 0);
        heroxpRewardPanel.AddClass('ShowHeroXPReward');
        totalXpAmount += xpAmount;
    }
    heroBadge.heroxp = unCurrentHeroXP + totalXpAmount;
    progressBar.uppervalue = unCurrentHeroXP + totalXpAmount;
    nextLevelProgressBar.value = unCurrentHeroXP + totalXpAmount;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2l0YWRlbF9kYl9wb3N0X2dhbWVfcHJvZ3Jlc3NfbG9jYWxfcGxheWVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vLi4vY29udGVudC9jaXRhZGVsL3Bhbm9yYW1hL3NjcmlwdHMvcG9zdF9nYW1lL2NpdGFkZWxfZGJfcG9zdF9nYW1lX3Byb2dyZXNzX2xvY2FsX3BsYXllci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUEsd0NBQXdDO0FBQ3hDLG9DQUFvQztBQUdwQyxJQUFJLGlCQUFpQixHQUFvQyxJQUFJLENBQUM7QUFPOUQsU0FBUyxpQ0FBaUM7SUFFdEMsK0JBQStCLEVBQUUsQ0FBQztBQUN0QyxDQUFDO0FBRUQsS0FBSyxVQUFVLCtCQUErQjtJQUUxQyxJQUFLLGlCQUFpQixJQUFJLENBQUMsaUJBQWlCLENBQUMsVUFBVSxFQUFFO1FBQ3JELGlCQUFpQixDQUFDLEtBQUssRUFBRSxDQUFDO0lBRTlCLGlCQUFpQixHQUFHLElBQUksS0FBSyxDQUFDLGtCQUFrQixFQUFFLENBQUM7SUFFbkQsSUFBSSxNQUFNLEdBQStCLENBQUMsQ0FBQyxlQUFlLEVBQUUsQ0FBQztJQUM3RCxJQUFJLG1CQUFtQixHQUFZLE1BQU0sQ0FBQyxxQkFBcUIsQ0FBRSxlQUFlLENBQUUsQ0FBQztJQUNuRixJQUFJLFdBQVcsR0FBRyxNQUFNLENBQUMscUJBQXFCLENBQUUsc0JBQXNCLENBQTZCLENBQUM7SUFDcEcsSUFBSSxvQkFBb0IsR0FBRyxNQUFNLENBQUMscUJBQXFCLENBQUUsc0JBQXNCLENBQW1CLENBQUM7SUFDbkcsSUFBSSxTQUFTLEdBQUcsTUFBTSxDQUFDLHFCQUFxQixDQUFFLFdBQVcsQ0FBd0IsQ0FBQztJQUNsRixJQUFJLGlCQUFpQixHQUFHLE1BQU0sQ0FBQyxxQkFBcUIsQ0FBRSxtQkFBbUIsQ0FBd0IsQ0FBQztJQUVsRyw2QkFBNkI7SUFDN0IsTUFBTSxDQUFDLFdBQVcsQ0FBRSxnQkFBZ0IsQ0FBRSxDQUFDO0lBRXZDLEtBQU0sSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxtQkFBbUIsQ0FBQyxhQUFhLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFDN0Q7UUFDSSxtQkFBbUIsQ0FBQyxRQUFRLENBQUUsQ0FBQyxDQUFFLENBQUMsV0FBVyxDQUFFLGtCQUFrQixDQUFFLENBQUM7S0FDdkU7SUFHRCxJQUFJLGVBQWUsR0FBRyxNQUFNLENBQUMsZUFBZSxDQUFDLGlCQUFpQixFQUFFLENBQUMsQ0FBQyxDQUFDO0lBQ25FLElBQUksYUFBYSxHQUFHLE1BQU0sQ0FBQyxlQUFlLENBQUMsZUFBZSxFQUFFLENBQUMsQ0FBQyxDQUFDO0lBRS9ELDZCQUE2QjtJQUM3QixNQUFNLENBQUMsUUFBUSxDQUFFLGdCQUFnQixDQUFFLENBQUM7SUFFcEMsTUFBTSxpQkFBaUIsQ0FBQyxLQUFLLENBQUUsR0FBRyxDQUFFLENBQUM7SUFFckMsSUFBSSxVQUFVLEdBQUcsS0FBSyxDQUFDO0lBRXZCLElBQUksYUFBYSxHQUFXLENBQUMsQ0FBQztJQUM5QixLQUFNLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsbUJBQW1CLENBQUMsYUFBYSxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQzdEO1FBQ0ksSUFBSSxpQkFBaUIsR0FBWSxtQkFBbUIsQ0FBQyxRQUFRLENBQUUsQ0FBQyxDQUFFLENBQUM7UUFDbkUsSUFBSSxRQUFRLEdBQVcsaUJBQWlCLENBQUMsZUFBZSxDQUFDLGVBQWUsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUM3RSxpQkFBaUIsQ0FBQyxRQUFRLENBQUUsa0JBQWtCLENBQUUsQ0FBQztRQUNqRCxnQkFBZ0IsQ0FBRSwwQkFBMEIsQ0FBRSxDQUFDO1FBRS9DLElBQUksTUFBTSxHQUFXLElBQUksQ0FBQyxHQUFHLENBQUUsRUFBRSxFQUFFLFFBQVEsQ0FBQyxDQUFDO1FBRTdDLEtBQU0sSUFBSSxLQUFLLEdBQUcsQ0FBQyxFQUFFLEtBQUssR0FBRyxNQUFNLEVBQUUsRUFBRSxLQUFLLEVBQzVDO1lBQ0ksSUFBSSxVQUFVLEdBQVcsZUFBZSxHQUFHLGFBQWEsR0FBRyxDQUFDLENBQUMsS0FBSyxHQUFDLEdBQUcsQ0FBQyxHQUFDLE1BQU0sQ0FBQyxHQUFDLFFBQVEsQ0FBQztZQUN6RixJQUFJLFVBQVUsR0FBRyxhQUFhLElBQUksQ0FBQyxVQUFVLEVBQzdDO2dCQUNJLFVBQVUsR0FBRyxhQUFhLENBQUE7Z0JBQzFCLFVBQVUsR0FBRyxJQUFJLENBQUM7Z0JBQ2xCLGdCQUFnQixDQUFFLGtDQUFrQyxDQUFFLENBQUM7Z0JBQ3ZELFNBQVMsQ0FBQyxNQUFNLEdBQUcsYUFBYSxDQUFDO2dCQUVqQyxTQUFTLENBQUMsUUFBUSxDQUFDLFNBQVMsQ0FBQyxDQUFBO2dCQUM3QixpQkFBaUIsQ0FBQyxRQUFRLENBQUMsU0FBUyxDQUFDLENBQUE7Z0JBRXJDLE1BQU0saUJBQWlCLENBQUMsS0FBSyxDQUFFLEdBQUcsQ0FBRSxDQUFDO2dCQUNyQyxpQkFBaUIsQ0FBQyxXQUFXLENBQUMsU0FBUyxDQUFDLENBQUE7Z0JBQ3hDLFNBQVMsQ0FBQyxXQUFXLENBQUMsU0FBUyxDQUFDLENBQUE7YUFDbkM7WUFFRCxnQkFBZ0IsQ0FBRSwrQkFBK0IsQ0FBRSxDQUFDO1lBRXBELFdBQVcsQ0FBQyxVQUFVLEdBQUcsVUFBVSxDQUFDO1lBQ3BDLG9CQUFvQixDQUFDLEtBQUssR0FBRyxVQUFVLENBQUM7WUFDeEMsTUFBTSxpQkFBaUIsQ0FBQyxLQUFLLENBQUUsSUFBSSxDQUFFLENBQUM7U0FDekM7UUFFRCxhQUFhLElBQUksUUFBUSxDQUFDO1FBQzFCLFdBQVcsQ0FBQyxVQUFVLEdBQUcsZUFBZSxHQUFHLGFBQWEsQ0FBQztRQUV6RCxNQUFNLGlCQUFpQixDQUFDLEtBQUssQ0FBRSxHQUFHLENBQUUsQ0FBQztLQUN4QztJQUVELGlCQUFpQixDQUFDLFdBQVcsRUFBRSxDQUFDO0lBRWhDLElBQUksVUFBVSxFQUNkO1FBQ0ksTUFBTSxpQkFBaUIsQ0FBQyxLQUFLLENBQUUsR0FBRyxDQUFFLENBQUM7S0FDeEM7U0FFRDtRQUNJLE1BQU0saUJBQWlCLENBQUMsS0FBSyxDQUFFLEdBQUcsQ0FBRSxDQUFDO0tBQ3hDO0lBRUQsTUFBTSxDQUFDLHVCQUF1QixFQUFFLENBQUM7QUFDckMsQ0FBQztBQUVELFNBQVMsdUJBQXVCO0lBRTVCLElBQUssQ0FBQyxpQkFBaUI7UUFDbkIsT0FBTztJQUVYLGlCQUFpQixDQUFDLElBQUksRUFBRSxDQUFDO0FBQzdCLENBQUM7QUFFRCxTQUFTLGlDQUFpQztJQUV0QyxJQUFJLE1BQU0sR0FBK0IsQ0FBQyxDQUFDLGVBQWUsRUFBRSxDQUFDO0lBQzdELElBQUksbUJBQW1CLEdBQVksTUFBTSxDQUFDLHFCQUFxQixDQUFFLGVBQWUsQ0FBRSxDQUFDO0lBQ25GLElBQUksV0FBVyxHQUFHLE1BQU0sQ0FBQyxxQkFBcUIsQ0FBRSxzQkFBc0IsQ0FBNkIsQ0FBQztJQUNwRyxJQUFJLG9CQUFvQixHQUFHLE1BQU0sQ0FBQyxxQkFBcUIsQ0FBRSxzQkFBc0IsQ0FBbUIsQ0FBQztJQUNuRyxJQUFJLFNBQVMsR0FBRyxNQUFNLENBQUMscUJBQXFCLENBQUUsV0FBVyxDQUF3QixDQUFDO0lBQ2xGLElBQUksZUFBZSxHQUFHLE1BQU0sQ0FBQyxlQUFlLENBQUMsaUJBQWlCLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFFbkUsTUFBTSxDQUFDLFFBQVEsQ0FBRSxnQkFBZ0IsQ0FBRSxDQUFDO0lBRXBDLElBQUksYUFBYSxHQUFXLENBQUMsQ0FBQztJQUM5QixLQUFNLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsbUJBQW1CLENBQUMsYUFBYSxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQzdEO1FBQ0ksSUFBSSxpQkFBaUIsR0FBWSxtQkFBbUIsQ0FBQyxRQUFRLENBQUUsQ0FBQyxDQUFFLENBQUM7UUFDbkUsSUFBSSxRQUFRLEdBQVcsaUJBQWlCLENBQUMsZUFBZSxDQUFDLGVBQWUsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUM3RSxpQkFBaUIsQ0FBQyxRQUFRLENBQUUsa0JBQWtCLENBQUUsQ0FBQztRQUNqRCxhQUFhLElBQUksUUFBUSxDQUFDO0tBQzdCO0lBQ0QsU0FBUyxDQUFDLE1BQU0sR0FBRyxlQUFlLEdBQUcsYUFBYSxDQUFDO0lBQ25ELFdBQVcsQ0FBQyxVQUFVLEdBQUcsZUFBZSxHQUFHLGFBQWEsQ0FBQztJQUN6RCxvQkFBb0IsQ0FBQyxLQUFLLEdBQUcsZUFBZSxHQUFHLGFBQWEsQ0FBQztBQUVqRSxDQUFDIn0=