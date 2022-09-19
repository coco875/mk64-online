import { Packet } from 'modloader64_api/ModLoaderDefaultImpls';
import { Heap } from 'modloader64_api/heap';
import { ILoggerLevels, IModLoaderAPI, IPlugin } from 'modloader64_api/IModLoaderAPI';
import { NetworkHandler } from 'modloader64_api/NetworkHandler';
import { onTick, onViUpdate } from 'modloader64_api/PluginLifecycle';
import { bool_ref } from 'modloader64_api/Sylvain/ImGui';

// see usage below in onViUpdate
class SomeDetailedPacket extends Packet {
    counter: number = 0

    constructor(counter: number, lobby: string) {
        super("SomeDetailedPacket", "SomeChannel", lobby, true)
        this.counter = counter
    }
}

function pathcher(address: Array<number>, replace: Array<number>, modloader) {
    for (let i in address) {
        for (let j in replace) {
            modloader.emulator.rdramWrite32(address[i]+(Number(j)*0x4), replace[j])
        }
    }
}

export class PluginSample implements IPlugin {
    ModLoader = {} as IModLoaderAPI
    name = "PluginSample"

    someCounterPointer = 0;

    start = false

    asmController = 0

    IAAdress:Array<number> = []

    sampleWindowOpen: bool_ref = [true]

    // run when this object is instanciated
    constructor() {
    }

    // before ModLoader is init
    preinit(): void {
        // print to the console
        this.ModLoader.logger.info("Hello, world!")
    }

    // called during ModLoader init
    init(): void {
        // you can also output warnings!
        this.ModLoader.logger.warn("Beware this message!")
    }

    // after ModLoader (and the emulator) is init
    postinit(): void {
        // you can interact with the emulator at this point
        let internal_name = this.ModLoader.rom.romReadBuffer(0x20, 0x18)

        this.ModLoader.logger.setLevel(ILoggerLevels.ALL)
        this.ModLoader.logger.debug(internal_name.toString('ascii')) // This only appears when the logger has the debug level!

        // don't have a heap? Make one!
        if (this.ModLoader.heap === undefined) {
            this.ModLoader.heap = new Heap(this.ModLoader.emulator, 0x81000000, (0x83DFFFFC - 0x81000000))
        }
    }

    // run every frame (the emulator is ready to be interacted with on frame 0)
    onTick(frame: number): void {
        if (!this.start){
            this.start = true
            this.asmController = this.ModLoader.emulator.rdramRead32(0x8000289C)
            for (let i = 0;i<8;i++) {
                this.IAAdress.push(this.ModLoader.emulator.rdramRead32(0x800DC4DC+(0x4*i)))
            }
            console.log(this.IAAdress)

            this.ModLoader.emulator.rdramWrite32(0x800E8294, 0x02004944) //replace texture 50cc by 150cc
            this.ModLoader.emulator.rdramWrite32(0x800E8294+4, 0x00000000) //don't show texture 100cc
            this.ModLoader.emulator.rdramWrite32(0x800E8294+8, 0x00000000) //don't show texture 150cc

            this.ModLoader.emulator.rdramWrite8(0x800F2B64,0) //reduce choice to one 1p
            this.ModLoader.emulator.rdramWrite8(0x800F2B64+3,0) //reduce choice to one 2p
            this.ModLoader.emulator.rdramWrite8(0x800F2B64+6,0) //reduce choice to one 3p
            this.ModLoader.emulator.rdramWrite8(0x800F2B64+12,0) //reduce choice to one 4p
            
            this.patchMenu()
            this.ModLoader.emulator.rdramWrite8(0x800F2B60+1,1) //reduce choice seconde colone
            
        }
        
        if (this.someCounterPointer === 0) {
            this.someCounterPointer = this.ModLoader.heap!.malloc(4)
            this.ModLoader.logger.info(`someCounterPointer is allocated at ${this.someCounterPointer.toString(16)}`)
        }

        // node that the heap allocates in the emulated memory
        this.ModLoader.emulator.rdramWrite32(this.someCounterPointer, frame)

        if (frame == 60) {
            // we can also log errors (this does not stop the emulator)
            this.ModLoader.logger.error("OH NO! SIXY FRAMES HAVE PASSED!!!")
        }
    }

    disableController(){
        this.ModLoader.emulator.rdramWrite32(0x8000289C, 0x0)
        this.ModLoader.emulator.invalidateCachedCode() // don't forget this to reload code
        this.ModLoader.logger.debug("controller disable")
    }

    enableController(){
        this.ModLoader.emulator.rdramWrite32(0x8000289C, this.asmController)
        this.ModLoader.emulator.invalidateCachedCode() // don't forget this to reload code
        this.ModLoader.logger.debug("controller enable")
    }

    patchMenu() {
        let patch = [0x00010000, 0x0B00D200, 0x00400012, 0x00000041, 0x00000000, 0x00010000, 0x0B00C700, 0x00400012, 0x00000053, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000] // ui of course vs and battle mode
        let adress = [0x8019BF58, 0x8019BFA8] // address for one and two player
        
        for (let i in adress) {
            adress[i] += 0x14
        }
        pathcher(adress, patch, this.ModLoader)

        // fix game mode
        patch = [0x00000002, 0x00000003] //the mod 4 is not real but replace after by the id of grand prix and 3 is for battle
        adress = [0x800F2B7C, 0x800F2B88, 0x800F2B94, 0x800F2BA0]

        pathcher(adress, patch, this.ModLoader)

        this.ModLoader.emulator.rdramWrite32(0x8003C23C, 0x0C00F096) // init player in versus mode
        this.ModLoader.emulator.rdramWrite32(0x8003a564, 0x240B0000) // don't show menu

        this.ModLoader.emulator.rdramWrite32(0x800382EC,0x10400064)

        this.ModLoader.emulator.invalidateCachedCode() // don't forget this to reload code
    }

    disableIA(){
        
    }

    // run every vertical interrupt
    @onViUpdate()
    onViUpdate() {
        // We can create windows using ImGui!
        this.ModLoader.ImGui.begin("SamplePlugin Window", this.sampleWindowOpen)
        {
            let counter = -1
            if (this.someCounterPointer !== 0) {
                counter = this.ModLoader.emulator.rdramRead32(this.someCounterPointer)
                this.ModLoader.ImGui.text(`frame: ${counter.toString()}`)
            }
            this.ModLoader.ImGui.separator()

            // send a basic packet
            if (this.ModLoader.ImGui.button("Send SomePacket")) {
                // packet id, packet channel, lobby, forward to other players (if false, the packet is handled by the server)
                let packet = new Packet("SomePacket", "SomeChannel", this.ModLoader.clientLobby, true)
                this.ModLoader.clientSide.sendPacket(packet)
            }

            // send a packet with data tacked on
            if (this.ModLoader.ImGui.button("Send SomeDetailedPacket")) {
                let packet = new SomeDetailedPacket(counter, this.ModLoader.clientLobby)
                this.ModLoader.clientSide.sendPacket(packet)
            }

            if (this.ModLoader.ImGui.button("Disable Controller")) {
                this.disableController()
            }

            if (this.ModLoader.ImGui.button("Enable Controller")) {
                this.enableController()
            }

            if (this.ModLoader.ImGui.button("test")) {

            }


        }
        this.ModLoader.ImGui.end()
    }

    // note that you do not receive packets sent by yourself, unless you are not forwarding the packet, and the server sends it back to you
    @NetworkHandler("SomePacket")
    onSomePacket(packet: Packet) {
        this.ModLoader.logger.info("We got some packet!")
    }

    @NetworkHandler("SomeDetailedPacket")
    onSomeDetailedPacket(packet: SomeDetailedPacket) {
        this.ModLoader.logger.info(`We got some detailed packet! The counter is ${packet.counter} !`)
    }

    // the user can make various events using the event bus, and there are various other events built into ModLoader. Some game cores have events as well
}

// export plugin (you can also use the default keyword on the class)
module.exports = PluginSample