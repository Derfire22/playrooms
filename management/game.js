//var

const lobby = require("./lobby.js");

const challenges_entries = shuffle(Object.entries(require("../private/challenges.json")));

function shuffle(array) {
    let currentIndex = array.length, randomIndex;
    // While there remain elements to shuffle.
    while (currentIndex != 0) {

        // Pick a remaining element.
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;

        // And swap it with the current element.
        [array[currentIndex], array[randomIndex]] = [
            array[randomIndex], array[currentIndex]];
    }
    return array;
}

function set_timeout_time(room, seconds) {
    room.game_data.next_step_time_start = new Date(new Date().toUTCString()).getTime();
    return new Date(new Date().toUTCString()).getTime() + (1000 * seconds);
}


function emit_team(io, room, team_id, data) {
    let players_sockets = [];
    for (const p_id of room.game_data.teams[team_id]) {
        players_sockets.push(lobby.get_player_socket(room, p_id));
    }
    io.to(players_sockets).emit('game_update', data);
}

function emit_player(io, room, player_id, data) {
    const socket = lobby.get_player_socket(room, player_id);
    if (socket) {
        io.to(socket).emit('game_update', data);
    }
}

function get_random_challenge(room) {
    let random_challenge_index = Math.floor(Math.random() * challenges_entries.length);
    while (random_challenge_index in room.game_data.challenges_used) {
        random_challenge_index = Math.floor(Math.random() * challenges_entries.length);
    }
    room.game_data.challenges_used.push(random_challenge_index);
    return challenges_entries[random_challenge_index];
}

function get_team_votes(room, team_id) {
    const votes = {};
    for (const player_id of room.game_data.teams[team_id]) {
        const data = room.game_data.players_data[player_id];
        if (data.vote) {
            votes[player_id] = { vote: data.vote };
        }
    }
    return votes;
}

function get_team_challenges(room, team_id) {
    let challenges = [];
    for (const player_id of room.game_data.teams[team_id]) {
        const data = room.game_data.players_data[player_id];
        if (data.challenge != '') {
            challenges.push(data.challenge);
        }
    }
    return challenges;
}

module.exports = function (io) {
    module.start = (room) => {

        const challenges_used = room.game_data.challenges_used;

        room.game_data = {
            state: 'teams',
            teams: [],
            teams_points: [16, 16],
            teams_data: { 0: {}, 1: {} },
            players_data: {},
            next_step_timeout: null,
            next_step_time_start: null,
            next_step_time: null,
            challenges_used: challenges_used == undefined ? [] : challenges_used
        }


        let players_id = shuffle(Object.keys(room.players));

        for (id of players_id) {
            // room.game_data.players_data[id] = {token:lobby.get_player_token(room,id)}
            room.game_data.players_data[id] = { challenge: '', vote: null };
        }

        room.game_data.teams.push(players_id.splice(0, Math.floor(players_id.length / 2)));
        room.game_data.teams.push(players_id);


        io.to(room.id).emit('game_update', {
            state: room.game_data.state,
            teams: room.game_data.teams
        });

        // console.log(room.game_data);

        setTimeout(() => {
            next_step(room, io);
        }, 17500);
    }

    module.get_game_data = (room) => {

    }

    module.get_player_data = (player_token, room) => {
        // attention pour le timer , redonner le temps écoulé depuis
        const player_id = room.players_auth[player_token].id
        if (player_id) {
            return room.game_data.players_data[player_id];
        }
    }


    //check if every one is good then pass next step

    module.update_player = (player_token, room, player_data, callback) => {
        const player_id = room.players_auth[player_token].id.toString();
        if (player_id !== undefined) {
            const game_data = room.game_data;
            let data_to_send = {
                teams: game_data.teams,
                teams_points: game_data.teams_points,
                state: game_data.state,
                next_step_time: game_data.next_step_time,
                next_step_time_start: game_data.next_step_time_start
            };
            const team = game_data.teams[0].includes(player_id) ? 0 : 1;
            switch (game_data.state) {
                case 'questions':
                    
                    let team_challenge_answer = game_data.teams_data[team].challenge[1];
                    if (team_challenge_answer.charAt(0) == team_challenge_answer.charAt(0).toUpperCase()) {
                        player_data = player_data.charAt(0).toUpperCase() + player_data.slice(1);
                    } else {
                        player_data = player_data.charAt(0).toLowerCase() + player_data.slice(1);
                    }
                    game_data.players_data[player_id].challenge = player_data;
                    // console.log(player_data);
                    break;
                case 'vote':
                    if(player_data != NaN) {
                        player_data = parseInt(player_data);
                        if(player_data != game_data.players_data[player_id].vote){
                            game_data.players_data[player_id].vote = player_data;
                            data_to_send.team_data = {
                                challenge: [game_data.teams_data[team].challenge[0],''],
                                challenges: game_data.teams_data[team].challenges
                            };
                            data_to_send.players_data = get_team_votes(room, team);
                            emit_team(io, room, team, data_to_send);
                        }
                    }
                    break;
                case 'challenge':
                    if (player_data != NaN) {
                        player_data = parseInt(player_data);
                        game_data.players_data[player_id].vote = player_data;
                    }
                    break;
                default:
                    break;
            }
            if (callback) { callback(); }
        }
    }

    return module;
}

function next_step(room, io) {
    if (room) {
        let data_to_send = {
            teams: room.game_data.teams,
            teams_points: room.game_data.teams_points,
        };
        let data = room.game_data;
        switch (data.state) {
            case 'teams':
                data.state = "questions";
                data_to_send.state = "questions";
                data.next_step_time = set_timeout_time(room, 90);
                data_to_send.next_step_time = set_timeout_time(room, 90);
                data_to_send.next_step_time_start = data.next_step_time_start;

                //récupération des challenges
                let challenge = get_random_challenge(room);
                console.log(challenge);
                data.teams_data[0].challenge = challenge;
                data_to_send.team_data = { challenge: [challenge[0],''] };
                emit_team(io, room, 0, data_to_send);

                challenge = get_random_challenge(room);
                console.log(challenge);
                data.teams_data[1].challenge = challenge;
                data_to_send.team_data = { challenge: [challenge[0],''] };
                emit_team(io, room, 1, data_to_send);

                data.next_step_timeout = setTimeout(() => {
                    next_step(room, io);
                }, 93000);
                break;
            case 'questions':
                data.state = "vote";
                data_to_send.state = "vote";
                if (data.teams[0].length + data.teams[1].length == 4) {
                    // for(const [player_id, data] of Object.entries(room.game_data.players_data)){
                    //     
                    // }
                    for (const team_id in data.teams) {
                        data.teams_data[team_id].challenges = get_team_challenges(room, team_id);
                        data.teams_data[team_id].challenges.push(data.teams_data[team_id].challenge[1]);
                        shuffle(data.teams_data[team_id].challenges);
                        data.teams_data[team_id].challenge[1] = '';
                    }
                    next_step(room, io);
                } else {
                    data.next_step_time = set_timeout_time(room, 30);
                    data_to_send.next_step_time = data.next_step_time;
                    data_to_send.next_step_time_start = data.next_step_time_start;
                    for (const team_id in data.teams) {
                        data.teams_data[team_id].challenges = get_team_challenges(room, team_id);
                        shuffle(data.teams_data[team_id].challenges);
                        // data.teams_data[team_id].challenge[1] = '';

                        if (data.teams[team_id].length == 2) {
                            data_to_send.team_data = null;
                            emit_team(io, room, team_id, data_to_send);
                        } else {
                            data_to_send.team_data = {
                                challenge: [data.teams_data[team_id].challenge[0],''],
                                challenges: data.teams_data[team_id].challenges
                            };
                            data_to_send.players_data = get_team_votes(room, team_id);
                            emit_team(io, room, team_id, data_to_send);
                        }
                    }
                    data.next_step_timeout = setTimeout(() => {
                        for(const team_id in data.teams){
                            if (data.teams[team_id].length != 2) {

                                top = {};
                                let team_challenges = data.teams_data[team_id].challenges;

                                team_challenges.map((_,index,array) => {
                                    top[index]=0;
                                });

                                data.teams[team_id].map((player_id,index,array)=>{
                                    top[data.players_data[player_id].vote]++
                                });

                                // for(const player_id of data.teams[team_id]){
                                //     vote = data.players_data[player_id].vote;
                                //     if(!top[vote]){
                                //         top[vote] = 1;
                                //     }else{
                                //         top[vote]++;
                                //     }
                                // }
                                tab = Object.entries(top).sort((a,b) => b[1] - a[1]);
                                
                                console.log('tab',tab);
                                
                                let selected_challenges = new Array();

                                for(const vote of tab){
                                    if(selected_challenges.length == 2){break;}
                                    if (vote[0] != null) {
                                        
                                        console.log('vote',vote[0]);
                                        console.log(team_challenges[vote[0]]);
                                        selected_challenges.push(team_challenges[vote[0]]);
                                    }
                                }
                                console.log(selected_challenges);
                                if (selected_challenges.length =! 2) {
                                    // for(const challenge of )
                                    console.log("Not enough votes !");
                                }
                                console.log(selected_challenges);
                                selected_challenges.push(data.teams_data[team_id].challenge[1]);
                                shuffle(selected_challenges);

                                console.log(selected_challenges);

                                data.teams_data[team_id].challenges = Array.from(selected_challenges);
                                data.teams_data[team_id].challenge[1] = '';

                                console.log('team_challenges',data.teams_data[team_id].challenges);
                            }
                            
                            
                        }
                        
                        next_step(room, io);
                    }, 30000);
                }
                break;
            case 'vote':
                data.state = "challenge";
                data_to_send.state = "challenge";
                data.next_step_time = set_timeout_time(room, 60);
                data_to_send.next_step_time = set_timeout_time(room, 60);
                data_to_send.next_step_time_start = data.next_step_time_start;
                data_to_send.team_data = data.teams_data[1];
                data_to_send.players_data = get_team_votes(room, 0);
                data.voting_team = 0;
                data_to_send.voting_team = 0;
                emit_team(io, room, 0, data_to_send);
                emit_team(io, room, 1, data_to_send);
                data.next_step_timeout = setTimeout(() => {
                    data.next_step_time = set_timeout_time(room, 60);
                    data_to_send.next_step_time = set_timeout_time(room, 60);
                    data_to_send.next_step_time_start = data.next_step_time_start;
                    data_to_send.voting_team = 1;
                    data_to_send.team_data = data.teams_data[0];
                    emit_team(io, room, 0, data_to_send);
                    emit_team(io, room, 1, data_to_send);
                    data.next_step
                }, 60000);
                break;
            case 'challenge':

            case 'end':
                break;
        }
        // console.log(room.id);
        // console.log(data.state);
        // console.log(room.game_data);
    }
}

