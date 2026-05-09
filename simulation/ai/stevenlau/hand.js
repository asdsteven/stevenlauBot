// Does what Brain tells me to.

export class Hand {
    constructor(playerID) {
        this.playerID = playerID
        this.chatBuffer = []
    }

    write(s) {
        this.chatBuffer.push(s)
    }

    flush() {
        this.chatBuffer.forEach(s =>
            Engine.PostCommand(this.playerID, { "type": "aichat", "message": s.replace(/[\[\]]/g, '\\$&') }))
        this.chatBuffer = []
    }

    deleteEntities(entities) {
        Engine.PostCommand(this.playerID, { "type": "delete-entities", "entities": entities.map(e => e.id) })
    }

    construct(entities, template, p, angle, queued = false, pushFront = false) {
	Engine.PostCommand(this.playerID, {
	    "type": "construct",
	    "entities": entities.map(e => e.id),
	    "template": template,
	    "x": p.x,
	    "z": p.y,
	    "angle": angle,
	    "autorepair": true,
	    "autocontinue": true,
	    "queued": queued,
	    "pushFront": false
	})
    }

    walk(entities, p, queued = false, pushFront = false) {
	Engine.PostCommand(this.playerID, { "type": "walk", "entities": entities.map(e => e.id), "x": p.x, "z": p.y, "queued": queued, "pushFront": pushFront })
    }
}

