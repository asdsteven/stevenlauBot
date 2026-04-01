// 0AD loads scripts by std::map order, so this will be loaded after Chat.js

class ChatToStevenlauBot extends Chat {
    constructor(playerViewControl, cheats) {
        super(playerViewControl, cheats);
        this.ChatInput.chatSubmitHandlers.splice(-1, 0, text => {
            if (Engine.GuiInterfaceCall("GetInitAttributes")
                      .settings.PlayerData
                      .some(x => x?.AI == "stevenlau"))
                Engine.GuiInterfaceCall("ChatToStevenlauBot", text);
            return false;
        });
    }
}

Chat = ChatToStevenlauBot;

