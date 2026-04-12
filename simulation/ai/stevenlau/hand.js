// Does what Brain tells me to.

export class Hand {
    constructor(playerID) {
        this.playerID = playerID
    }

    write(s) {
        Engine.PostCommand(this.playerID, { "type": "aichat", "message": s.replace(/[\[\]]/g, '\\$&') })
    }

    deleteEntities(entities) {
        Engine.PostCommand(this.playerID, { "type": "delete-entities", "entities": entities.map(e => e.id) })
    }

    construct(entities, template, x, z, angle, queued = false) {
	Engine.PostCommand(this.playerID, {
	    "type": "construct",
	    "entities": entities.map(e => e.id),
	    "template": template,
	    "x": x,
	    "z": z,
	    "angle": angle,
	    "autorepair": true,
	    "autocontinue": true,
	    "queued": queued,
	    "pushFront": false
	});
    }
}

