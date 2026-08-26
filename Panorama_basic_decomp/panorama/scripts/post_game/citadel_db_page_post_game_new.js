"use strict";
/// <reference path="../citadel.d.ts" />
/// <reference path="../async.ts" />
// Called from C++ to get the testing data
function GetTestingProgressDataJSON() {
    let data = {
        match_id: "0",
        match_mode: 4 /* ECitadelMatchMode.k_ECitadelMatchMode_Ranked */,
        game_mode: 1 /* ECitadelGameMode.k_ECitadelGameMode_Normal */,
        winning_team: 0 /* ECitadelLobbyTeam.k_ECitadelLobbyTeam_Team0 */,
        ranked_type: 1 /* ECitadelRankedType.k_eCitadelRankedType_Normal */,
        rank_interval: 1,
        local_player: {
            player_slot: 0,
            account_id: 85501006,
            hero_id: 63,
            team: 0 /* ECitadelLobbyTeam.k_ECitadelLobbyTeam_Team0 */,
            mvp_rank: 0,
            player_rank_data: {
                initial_display_rank: 111,
                initial_flat_progress: 60100,
                final_flat_progress: 60425,
                desired_progress_change: 250,
                initial_calibration_games: 0,
                initial_demotion_protection_games: 2,
                consumed_demotion_protection: false,
                initial_win_streak: 3,
            },
            player_match_outcome: 1 /* EPlayerMatchOutcome.k_EPlayerMatchOutcome_Win */,
            accolades: [
                {
                    accolade_id: 1,
                    accolade_name: "#Citadel_VData_accolades_assists_FlavorName",
                    accolade_desc: "#Citadel_VData_accolades_assists_Description:p",
                    accolade_stars_achieved: 3,
                    accolade_stat_value: 23,
                },
                {
                    accolade_id: 2,
                    accolade_name: "#Citadel_VData_accolades_returned_idol_FlavorName",
                    accolade_desc: "#Citadel_VData_accolades_returned_idol_Description:p",
                    accolade_stars_achieved: 2,
                    accolade_stat_value: 2,
                },
                {
                    accolade_id: 3,
                    accolade_name: "#Citadel_VData_accolades_breakables_destroyed_FlavorName",
                    accolade_desc: "#Citadel_VData_accolades_breakables_destroyed_Description:p",
                    accolade_stars_achieved: 1,
                    accolade_stat_value: 123,
                },
            ],
        },
        mvp_players: [
            {
                player_slot: 1,
                account_id: 108002,
                hero_id: 6,
                team: 0 /* ECitadelLobbyTeam.k_ECitadelLobbyTeam_Team0 */,
                mvp_rank: 1,
                player_match_outcome: 1 /* EPlayerMatchOutcome.k_EPlayerMatchOutcome_Win */,
                accolades: [
                    {
                        accolade_id: 1,
                        accolade_name: "#Citadel_VData_accolades_assists_FlavorName",
                        accolade_desc: "Citadel_VData_accolades_assists_Description:p",
                        accolade_stars_achieved: 3,
                        accolade_stat_value: 23,
                    },
                    {
                        accolade_id: 2,
                        accolade_name: "#Citadel_VData_accolades_returned_idol_FlavorName",
                        accolade_desc: "#Citadel_VData_accolades_returned_idol_Description:p",
                        accolade_stars_achieved: 2,
                        accolade_stat_value: 2,
                    },
                    {
                        accolade_id: 3,
                        accolade_name: "#Citadel_VData_accolades_breakables_destroyed_FlavorName",
                        accolade_desc: "#Citadel_VData_accolades_breakables_destroyed_Description:p",
                        accolade_stars_achieved: 1,
                        accolade_stat_value: 123,
                    },
                ],
            },
            {
                player_slot: 2,
                account_id: 85501006,
                hero_id: 63,
                team: 1 /* ECitadelLobbyTeam.k_ECitadelLobbyTeam_Team1 */,
                mvp_rank: 2,
                player_match_outcome: 1 /* EPlayerMatchOutcome.k_EPlayerMatchOutcome_Win */,
                accolades: [
                    {
                        accolade_id: 1,
                        accolade_name: "#Citadel_VData_accolades_player_damage_FlavorName",
                        accolade_desc: "#Citadel_VData_accolades_player_damage_Description:p",
                        accolade_stars_achieved: 3,
                        accolade_stat_value: 83435,
                    },
                    {
                        accolade_id: 2,
                        accolade_name: "#Citadel_VData_accolades_killstreak_kills_FlavorName",
                        accolade_desc: "#Citadel_VData_accolades_killstreak_kills_Description:p",
                        accolade_stars_achieved: 2,
                        accolade_stat_value: 5,
                    },
                ],
            },
            {
                player_slot: 3,
                account_id: 85502759,
                hero_id: 2,
                team: 0 /* ECitadelLobbyTeam.k_ECitadelLobbyTeam_Team0 */,
                mvp_rank: 3,
                player_match_outcome: 1 /* EPlayerMatchOutcome.k_EPlayerMatchOutcome_Win */,
                accolades: [
                    {
                        accolade_id: 1,
                        accolade_name: "#Citadel_VData_accolades_long_distance_kills_FlavorName",
                        accolade_desc: "#Citadel_VData_accolades_long_distance_kills_Description:p",
                        accolade_stars_achieved: 3,
                        accolade_stat_value: 8,
                    },
                    {
                        accolade_id: 2,
                        accolade_name: "#Citadel_VData_accolades_ability_damage_FlavorName",
                        accolade_desc: "#Citadel_VData_accolades_ability_damage_Description:p",
                        accolade_stars_achieved: 2,
                        accolade_stat_value: 9345,
                    },
                ],
            },
        ]
    };
    return JSON.stringify(data);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2l0YWRlbF9kYl9wYWdlX3Bvc3RfZ2FtZV9uZXcuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi9jb250ZW50L2NpdGFkZWwvcGFub3JhbWEvc2NyaXB0cy9wb3N0X2dhbWUvY2l0YWRlbF9kYl9wYWdlX3Bvc3RfZ2FtZV9uZXcudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBLHdDQUF3QztBQUN4QyxvQ0FBb0M7QUFpRXBDLDBDQUEwQztBQUMxQyxTQUFTLDBCQUEwQjtJQUUvQixJQUFJLElBQUksR0FDUjtRQUNJLFFBQVEsRUFBRSxHQUFHO1FBQ2IsVUFBVSxzREFBOEM7UUFDeEQsU0FBUyxvREFBNEM7UUFDckQsWUFBWSxxREFBNkM7UUFDekQsV0FBVyx3REFBZ0Q7UUFDM0QsYUFBYSxFQUFFLENBQUM7UUFDaEIsWUFBWSxFQUNaO1lBQ0ksV0FBVyxFQUFFLENBQUM7WUFDZCxVQUFVLEVBQUUsUUFBUTtZQUNwQixPQUFPLEVBQUUsRUFBRTtZQUNYLElBQUkscURBQTZDO1lBQ2pELFFBQVEsRUFBRSxDQUFDO1lBRVgsZ0JBQWdCLEVBQUU7Z0JBQ2Qsb0JBQW9CLEVBQUUsR0FBRztnQkFDekIscUJBQXFCLEVBQUUsS0FBSztnQkFDNUIsbUJBQW1CLEVBQUUsS0FBSztnQkFDMUIsdUJBQXVCLEVBQUUsR0FBRztnQkFDNUIseUJBQXlCLEVBQUUsQ0FBQztnQkFDNUIsaUNBQWlDLEVBQUUsQ0FBQztnQkFDcEMsNEJBQTRCLEVBQUUsS0FBSztnQkFDbkMsa0JBQWtCLEVBQUUsQ0FBQzthQUN4QjtZQUVELG9CQUFvQix1REFBK0M7WUFFbkUsU0FBUyxFQUFFO2dCQUNQO29CQUNJLFdBQVcsRUFBRSxDQUFDO29CQUNkLGFBQWEsRUFBRSw2Q0FBNkM7b0JBQzVELGFBQWEsRUFBRSxnREFBZ0Q7b0JBQy9ELHVCQUF1QixFQUFFLENBQUM7b0JBQzFCLG1CQUFtQixFQUFFLEVBQUU7aUJBQzFCO2dCQUNEO29CQUNJLFdBQVcs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