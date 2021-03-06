
var outdent = require("outdent");

var shen =   require("../shen");
var Logger = require("../util/logger");

function formatMatch(userid, match, stats) {
	if(match.includesPlayer(userid)) {
		var msg = "\`\`\`md\n";
		msg += `${ match.id }. < ${ match.label } > `;
		match.userIds.forEach((v, k) => {
			if(k != 0) { msg += " vs. "; }
			if(match.isWinner(v)) {
				msg += `**${ v }** (${ stats.rating(v) })`;
			} else {
				msg += `${ v } (${ stats.rating(v) })`;
			}
		});
		msg += "\n  rounds: ";
		// match.userIds.forEach((value, j) => {
		// 	message += `\t${j}. ${ value }: ${ match.getRoundWins(value) }`;
		// 	if(match.isWinner(value)) { message += " ** winner **"; }
		// 	message += "\n";
		// });
		match.rounds.forEach(round => {
			msg += ` <${ round.winner }>`;
		});
		msg += "\`\`\`";
		return msg;
	}
	return null;
}

var Static = {};

class DiscordCommands {

	static debug(_author, _channel, args) {
		if(args.length > 0) {
			var root = args[0];

			if(root == "match" && args.length >= 2) {
				var cmd = args[1];

				// fill values of the keys of all matches,
				// if they're missing
				if(cmd == "fill" && args.length == 4) {
					var key = args[2];
					var value = args[3];

					shen.fetchMatches().then(matches => {
						matches.forEach(match => {
							if(match[key] == null) {
								match[key] = value;
								shen.db.write(match.dbKey, match.dbModel);
							}
						});
					})
					.catch(error => {
						Logger.error(error);
					});
				}
			}
		}
	}

	static _promptyn(member, channel, _args, bot) {
		bot.promptUserYN(member, channel, "This is a test Y/N prompt. Answer the prompt by typing \"yes\" or \"no\".")
		.then((choice) => {
			if(choice) {
				channel.sendMessage("Interpreted answer as \"yes\".");
			} else {
				channel.sendMessage("Interpreted answer as \"no\".");
			}
		}).catch((reason) => {
			channel.sendMessage("Could not interpret response.");
			channel.sendMessage(reason);
		});
	}

	static _prompt(member, channel, _args, bot) {
		bot.promptUser(member, channel, "This is a test prompt. Answer the prompt by typing anything.")
		.then((choice) => {
			channel.sendMessage("Interpreted answer as \"" + choice + "\".");
		});
	}

	static killme(_member, channel, _args) {
		channel.sendMessage("i want to die :sob: :gun:");
	}

	/**
	 * @static
	 * Links a user to a discord account. Takes the @mention of the
	 * user as the argument.
	 *
	 * @param  {type} member  description
	 * @param  {type} channel description
	 * @param  {type} args    description
	 */
	static linkUser(member, channel, args) {
		if(!member.permissions.hasPermission("ADMINISTRATOR")) {
			return; // lock out any user that is not a server admin
		}

		if(args.length >= 2) {
			let userID = args[0].toLowerCase();
			let mention = args[1];
			if(mention.indexOf("<@") !== 0) {
				channel.sendMessage("The second argument isn't a @mention. `" + mention + "`");
				return;
			}
			let username = mention.substring(2, mention.length - 1);
			shen.db.discordLinkUser(userID, username)
			.then(() => {
				channel.sendMessage(`Successfully linked user \`${userID}\` to Discord account \`${username}\``);
			});
		}
	}

	static addUser(member, channel, args) {
		if(!member.permissions.hasPermission("ADMINISTRATOR")) {
			return; // lock out any user that is not a server admin
		}

		if(args.length >= 2) {
			let userID = args[0];
			let nickname = args.slice(1).join(" "); // join everything after 1st arg

			let user = shen.User(userID, nickname);
			shen.db.addUser(user)
			.then(()=> {
				channel.sendMessage(outdent`
					Successfully added user with ID \`${userID}\`. :ok_hand:
					Nickname: \`${nickname}\`
				`);
			});
		}
	}

	static register(member, channel, args, bot) {

		bot.promptUser(member, channel, "Please enter your display name.\nThis name will be used in the leaderboards and will identify you in matches.")
		.then((name) => {
			bot.promptUserYN(member, channel, "Please confirm you want your name to be \"" + name + "\" by entering \"yes\" or \"no\".")
			.then((yes) => {
				if(yes) {
					channel.sendMessage("<add new user here> :ok_hand:");
				} else {
					channel.sendMessage("Alright. Type `$register` again to re-enter your name.");
				}
			});
		});
	}

	// prints player statistics
	static stats(_author, channel, args) {
		if(args.length == 2) {
			var tournamentId = args[0];
			var userid = args[1];
			var history = 0;
			if(args.length == 2) {
				history = Number(args[1]);
			}

			var tournament;

			shen.fetchTournament(tournamentId)
			.then(value => {
				tournament = value;
				return tournament.fetchStats();
			})
			.then(stats_history => {
				if(!stats_history.playerExists(userid)) {
					channel.sendMessage("that player does not exist.");
				} else {
					var stats;
					if(history == 0) {
						stats = stats_history.latest();
						channel.sendMessage(`player stats of **${ userid }** (latest)`);
					} else if (history < 0) { // relative to latest
						stats = stats_history.latest(history);
						channel.sendMessage(`player stats of **${ userid }** (${ -history } matches before latest)`);
					} else { // at specific match
						stats = stats_history.atMatch(history);
						channel.sendMessage(`player stats of **${ userid }** (at match ${ history })`);
					}

					var pstats = stats.getPlayerStats(userid);

					channel.sendMessage(outdent`
						\`\`\`
						total matches: ${ pstats._matchCount }
						wins: ${ pstats._wins } ( ${ Math.round(pstats._wins / pstats._matchCount * 100, 2) }% )
						rating: ${ pstats.rating }
						\`\`\`
					`);
				}
			})
			.catch(error => {
				Logger.log("error", error.stack);
			});
		}
	}

	// prints info on the current tournament
	static tinfo(_author, channel, args) {
		if(args.length == 0) {
			channel.sendMessage(outdent`
				\`\`\`md
				!info <id> - Gets information about the tournament with this ID.
				\`\`\`
			`);
		}
		if(args.length == 1) {
			let tournamentId = args[0];
			shen.fetchTournament(tournamentId)
			.then(tournament => {
				var message = outdent`
					The current tournament is: **${ tournament.title }**
					\`\`\`yml
					id: "${ tournament.id }",
					game: "${ tournament.game.title }",
					matches: ${ tournament.matches.length },
					entrants: "${ tournament.users }"
					\`\`\`
				`;
				channel.sendMessage(message);
			})
			.catch(error => {
				channel.sendMessage("```" + error + "```");
				channel.sendMessage("```" + error.stack + "```");
			});
		}
	}

	// static setCurrentTournament(_author, channel, args) {
	// 	if(args.length == 0) {
	// 		channel.sendMessage(outdent`
	// 			\`\`\`md
	// 			.current <t-id> - sets the current tournament for future commands
	// 			\`\`\`
	// 		`);
	// 	}
	//
	// }

	/**
	 * Game management commands
	 */
	static g(member, channel, args) {
		if(!member.permissions.hasPermission("ADMINISTRATOR")) {
			return; // lock out any user that is not a server admin
		}
		if(args.length == 0) {
			channel.sendMessage(outdent`
				\`\`\`md
				.g <id> edit stage <stage>
				\`\`\`
			`);
		}
		var time = Date.now();
		var elapsed = () => {
			return (Date.now() - time) / 1000;
		};

		// set current game
		if(args.length == 2 && args[0] == "set") {
			var gameID = args[1];
			shen.db.fetchGametype(gameID)
			.then(game => {
				Static.game = game;
				channel.sendMessage(`Fetched game **${game.title}** in ${elapsed()} seconds.`);
			})
			.catch(_error => {
				channel.sendMessage("Sorry, we couldn't find a game with that ID.");
			});
		}
		if(args.length >= 1 && args[0] == "stage") {
			let game = Static.game;
			// add stage
			// ---------
			if(args.length >= 4 && args[1] == "add") {
				let stageID = args[2].toLowerCase();
				let stageTitle = args.slice(3).join(" "); // join everything after 1st arg
				shen.db.writeGameProperty(game.id, "stage/" + stageID, stageTitle)
				.then(() => {
					channel.sendMessage(`Added stage **${stageTitle}** \`id=${stageID}\` in ${elapsed()} seconds.`);
				});
			}
			// list stages
			// -----------
			if(args.length >= 2 && args[1] == "list") {
				let message = "```\n";
				Object.getOwnPropertyNames(game.stages).forEach(key => {
					message += `(${key}) ${game.stages[key]}\n`;
				});
				message += "```";
				channel.sendMessage(message);
			}
		}
		if(args.length >= 1 && args[0] == "char") {
			let game = Static.game;
			// add character
			// -------------
			if(args.length >= 4 && args[1] == "add") {
				let charID = args[2].toLowerCase();
				let charName = args.slice(3).join(" "); // join everything after 1st arg
				shen.db.writeGameProperty(game.id, "character/" + charID, charName)
				.then(() => {
					channel.sendMessage(`Added character **${charName}** \`id=${charID}\` in ${elapsed()} seconds.`);
				});
			}
			// list characters
			// ---------------
			if(args.length >= 2 && args[1] == "list") {
				let message = "```\n";
				Object.getOwnPropertyNames(game.characters).forEach(key => {
					message += `(${key}) ${game.characters[key]}\n`;
				});
				message += "```";
				channel.sendMessage(message);
			}
		}
	}

	/**
	 * Tournament management commands
	 *
	 * @param  {type} _author description
	 * @param  {type} channel description
	 * @param  {type} args    description
	 * @returns {type}         description
	 */
	static t(member, channel, args) {
		if(!member.permissions.hasPermission("ADMINISTRATOR")) {
			return; // lock out any user that is not a server admin
		}
		if(args.length == 0) { // help command
			channel.sendMessage(outdent`
				\`\`\`md
				.tourny - print this help message
				.tourny create <id> <game> - initializes and sets a tournament
				.tourny set <id>
				.tourny edit <property> <value> - sets a config property
				.tourny adduser <userID> - adds a player or match by their id
				.tourny match <userID a> <userID b> <winner> - adds a new match with basic information
				\`\`\`
			`);
			if(Static.tournament == null) {
				channel.sendMessage("There's no current tournament set right now.");
			} else {
				channel.sendMessage("The current tournament is: " + Static.tournament.title);
			}
		}
		if(args.length == 2 && args[0] == "set") { // set current tournament
			let tournamentId = args[1];
			channel.sendMessage("Loading tournament \`" + args[1] + "\`...");
			shen.fetchTournament(tournamentId)
			.then(tournament => {
				Static.tournament = tournament;
				channel.sendMessage("The current tournament is: " + Static.tournament.title);
			})
			.catch(error => {
				console.log("```" + error.stack + "```");
				channel.sendMessage("We couldn't find a tournament with that ID. :disappointed_relieved:");
			});
		}
		if(args.length == 3 && args[0] == "create") { // new command
			let tournamentId = args[1];
			let gameId = args[2];
			shen.db.addTournament(tournamentId, gameId)
			.then(() => {
				channel.sendMessage(`Successfully created new tournament. (\`id=${tournamentId}, game=${gameId}\`)`);
			})
			.catch(error => {
				channel.sendMessage("```" + error.stack + "```");
			});
		}
		if(args.length === 2 && args[0] == "adduser") { // add user command
			if(Static.tournament == null) {
				channel.sendMessage("There's no current tournament set right now.");
				return; // end command here
			}
			let userID = args[1];
			shen.db.fetchUser(userID)
			.then(user => {
				shen.db.addPlayer(user, Static.tournament.id)
				.then(() => {
					channel.sendMessage(`Added player ${user.id} to tournament. (\`id=${Static.tournament.id}\`)`);
				})
				.catch(error => {
					channel.sendMessage("```" + error.stack + "```");
				});
			});
		}
		if(args.length == 4 && args[0] == "edit") { // new command
			let tournamentId = args[1];
			let property =     args[2];
			let value =        args[3];
			let obj = {};
			obj[property] = value;
			shen.db.writeTournamentProperties(tournamentId, obj)
			.then(() => {
				channel.sendMessage(`Successfully set property ${property} (\`id=${tournamentId}\`)`);
			})
			.catch(error => {
				channel.sendMessage("```" + error.stack + "```");
			});
		}
		if(args.length >= 2 && args[0] == "match") { // new match command
			if(DiscordCommands.static.tournament == null) {
				channel.sendMessage("There's no current tournament set right now.");
				return; // end command here
			}
			let input = args[1];
			let userIds, winners;
			if(input.indexOf("<") !== -1) { // left player won
				userIds = input.split("<");
				winners = [userIds[0]];
			} else
			if (input.indexOf(">") !== -1) { // right player won
				userIds = input.split(">");
				winners = [userIds[1]];
			}
			else { // none of the characters were found, throw an error
				throw new TypeError("Recieved username input without < or >: " + input);
			}

			// let userIds =      [args[1], args[2]];
			// let winners =      [args[3]];
			shen.db.createMatch(DiscordCommands.static.tournament.id, userIds, winners)
			.then(() => {
				channel.sendMessage(`Added new match ("${userIds[0]} vs ${userIds[1]}")`);
			})
			.catch(error => {
				channel.sendMessage("```" + error.stack + "```");
			});
		}
	}

	// prints player history for the current tournament
	static history(member, channel, args) {
		var tournamentId = null, userId = null, promise = null;
		// no args - try to find the user this member is linked to
		if(args.length == 0 && Static.tournament != null) {
			promise = shen.fetchUserFromDiscordID(member.id).then(user => {
				userId = user.id;
				return Static.tournament;
			})
			.catch(error => {
				channel.sendMessage("I can't see your match history. Are you linked to a Shen account?");
				channel.sendMessage("Try getting the match history of a specific player: `.history <username>` :thumbsup:");
				console.log(error.stack);
			});
		}
		// 1 arg - use the current tournament
		if(args.length == 1 && Static.tournament != null) {
			userId = args[0];
			promise = Promise.resolve(Static.tournament);
		}
		// 2 args - use a user-defined tournament
		if(args.length >= 2) {
			tournamentId = args[1];
			userId = args[0];
			promise = shen.fetchTournament(tournamentId);
			//var tournament;
			//var stats_history;
		}
		// then the current promise if any
		if(promise != null) {
			promise.then(tournament => {
				if(userId != null) {
					var user = tournament.getUser(userId);
					var stats = tournament.standings.latest().getStats(user);

					channel.sendMessage(`printing match history for **${ user.nickname }**`);
					var message = "```diff\n";
					//var count = 0;
					stats.matches.forEach(match => {
						var label = match.getUserByOrder(0).nickname + " vs. " + match.getUserByOrder(1).nickname;
						if(match.isWinner(user)) {
							message += "+| Match " + match.id + " - " + label + "\n";
						} else {
							message += "-| Match " + match.id + " - " + label + "\n";
						}
					});
					message += "```";
					channel.sendMessage(message);
				}
			})
			.catch(error => {
				Logger.log("error", error);
			});
		}

	}

	// prints the rankings for the current tournament
	static rankings(_author, channel, args) {
		var promise = null;
		if(args.length == 0 && Static.tournament != null) { // use the static tournament
			promise = Promise.resolve(Static.tournament);
		}
		if(args.length >= 1) { // find another tournament
			let tournamentId = args[0];
			promise = shen.fetchTournament(tournamentId);
		}
		if(promise == null) {
			channel.sendMessage("Sorry, there isn't a tournament currently loaded.");
			channel.sendMessage("(Try `.t set <tournament-id>`? :wink:)");
		}

		promise.then(tournament => {
			var message = "";
			var last_division = "";
			var standings = tournament.standings.latest();
			channel.sendMessage("Current tournament standings for: **" + tournament.title + "**\n");
			var unrankedUsers = [];
			standings.rankings.forEach(user => {
				var division = tournament.ranker.getDivision(standings.rating(user));
				var stats = standings.getStats(user);
				// the number of matches in order to be ranked
				if(stats.matches.length >= 3) { // TODO: don't hardcode this value
					if(division.name !== last_division) {
						if(last_division !== "") {
							message += "\`\`\`\n";
						}
						message += "*Division " + division.name + "*\n";
						message += "\`\`\`md\n";
						last_division = division.name;
					}

					message += "<" + standings.rating(user) + "> < " + standings.getStats(user).points + " pts > | ";
					message += user.nickname + "\n";
				} else {
					unrankedUsers.push(user);
				}
			});

			message += "\`\`\`";

			channel.sendMessage(message);

			// after, print unranked players
			channel.sendMessage("The following players are currently unranked:");
			message = "\`\`\`\n";
			unrankedUsers.forEach(user => {
				message += user.nickname + "\n";
			});
			message += "\`\`\`";
			channel.sendMessage(message);
		})
		.catch(error => {
			Logger.log("error", error.stack);
		});
	}
}

DiscordCommands.static = Static;

module.exports = DiscordCommands;
