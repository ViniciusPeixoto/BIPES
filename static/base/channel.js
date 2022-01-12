"use strict"

import {Tool} from './tool.js'
import {command} from './command.js'

// Commom MicroPython outputs
const BACKSPACE = '[K' // Backspace character
const PASTEMODE = "paste mode; Ctrl-C to cancel, Ctrl-D to finish" // Paste mode output

class Channel {
   /**
   * Create the Channel object with a root object.
   * @param {Object} root - Root object, where all callbacks are child from.
   */
  constructor (){
    this.name = 'channel'
    this.current

    this.currentProtocol // Just a string with the current connected protocol
    this.input = []   // Input to be sent to a device
    this.output = ''  // Output from the last command run in the decide
    this.watcher      // Store the interval to send data to a device
    this.lock = false // If the terminal is free to send new data
    this.dirty = false// If the terminal has input (user raw input or timers)
    this.callbacks = []

    this.webserial = new _WebSerial(this)
    this.websocket = new _WebSocket(this)

    this.checkUp ()
    this.targetDevice
    this.ping = {      // Create a timer on connect and on message to check
      timer:undefined, // if the device is responding
      on:false
    }
    // Cross tabs event handler on muxing terminal
    command.add(this, {
      push: this.push,
      rawPush: this.rawPush
    })

    window.addEventListener("beforeunload", () => {
      if (this.current != undefined)
        this.disconnect(true)
    })
  }
  renewPing (){
    clearTimeout(this.ping.timer)
    this.ping.timer = setTimeout(()=>{
      if (this.ping.on === false)
        window.bipes.page.device.unresponsive(this.targetDevice)
      }, 2000)
  }
  /*
  @param {String, Uint8Array} cmd - String or uint8 array.
  */
  push (cmd, targetDevice, callback, tabUID){
    if (this.current == undefined || this.targetDevice != targetDevice)
      return

    this.renewPing()

    if (cmd.constructor.name == 'Uint8Array') {
      this.input.push([cmd])
    } else if (typeof cmd == 'string') {
      let reg = new RegExp(`(.|[\r]){1,${this.current.config.packetSize}}`, 'g')
      cmd = cmd.replaceAll('\t',"    ").replaceAll(/\r\n|\n/gm, '\r')
      this.input.push([...cmd.match(reg)])
    }
    // Build callback function
    if (callback != undefined && callback.constructor.name == 'Array') {
      let self = window.bipes.page,
          fun
      if (callback.length == 0) {
        // Filler/dummy callback
        fun = () => {}
      } else {
        for (let i = 0; i < callback.length-1; i++) {
          self = self[callback[i]]
      }
        fun = self[callback[callback.length-1]]
      }
      this.callbacks.push({
        self:self,
        fun:fun,
        cmd:cmd
      })
      if (tabUID)
        this.callbacks[this.callbacks.length - 1].uid = tabUID
    }
  }
  rawPush (cmd, targetDevice){
    if (!this.current || this.targetDevice != targetDevice)
      return

    this.dirty = true
    this.current.write(cmd)
  }
  switch (channel){
    this.diconnect()
    this.connect(channel)

  }
  connect (channel, callback, conf){
    switch (channel){
      case 'websocket':
        this[channel].connect(callback, conf)
        break
      default:
        this[channel].connect(callback)
    }
  }
  _connected (channel, callback){
    this.targetDevice = Tool.UID()
    this.current = this[channel]
    this.currentProtocol = this.current.name
    this.watcher = setInterval(
      this.current.watch.bind(this.current),
      50);
    window.bipes.page.prompt.on()
    window.bipes.page.prompt.write(`\r\n\x1b[31mConnected with ${this.currentProtocol}!\x1b[m\r\n`);
    this.push('\r\n', this.targetDevice)
    if (typeof callback == 'object' && typeof callback[1] == 'function')
      callback[1].apply(callback[0])
  }
  disconnect (force){
    if (!this.current.disconnect(force))
      return

    this._disconnected()
  }
  _disconnected (){
    clearInterval(this.watcher);

    this.output = ''
    this.callbacks = []
    this.current = undefined
    let uid = this.targetDevice,
        currentProtocol = this.currentProtocol
    this.currentProtocol = ''
    this.targetDevice = undefined
    window.bipes.page.device.unuse(uid)
    window.bipes.page.prompt.off()
    window.bipes.page.prompt.write(`\r\n\x1b[31mDisconnected from ${currentProtocol}!\x1b[m\r\n`);
  }
  checkUp (){
    if (navigator.serial == undefined)
      console.error("Don't support WebSerial")
  }
  handleCallback (out){
    // Remove backspaces and characters that antecends it
    out = this.interpretBackspace(out)
    let call = this.callbacks[0]

    if (!call.hasOwnProperty('skip') && !/^[\x00-\x7F]{1}$/.test(call.cmd)) {
      // Emulate command in paste mode
      if (call.cmd[0] == '\x05')
        call.cmd = this.emulatePasteMode(call.cmd)

      if (out.substring(0, call.cmd.length) != call.cmd) {
        console.error("Channel: callback's commands checkup failed")
        this.callbacks = []
        this.output = ''
        this.lock = false
        return true
      }
      out = out.substr(call.cmd.length)
      try {
        if (call.uid) {
          call.fun.apply(
           call.self, [out, call.cmd, call.uid]
          )
        } else {
          call.fun.apply(
            call.self, [out, call.cmd]
          )
        }
      } catch (e){
        console.error(e)
      }
    }
    this.output = ''
    this.lock = false

    this.callbacks.shift()
  }
  interpretBackspace (out){
    let _out = []
    // Simplify micropython's backspace
    out = out.replaceAll(BACKSPACE, '\b')

    for (let char of out) {
      if (char == '\b') {
        _out.pop()
      } else
        _out.push(char)
    }

    return _out.join('')
  }
  emulatePasteMode (cmd) {
    // Remove paste mode chars
    cmd = cmd.substring(1,cmd.length -1)
    return `\r\n${PASTEMODE}\r\n=== ${cmd.replaceAll(/\r/g,'\r\n=== ')}`
  }
  /*
   * Return a command with paste mode enclosing
   */
  pasteMode (cmd){
    return `\x05${cmd}\x04`
  }

  isDirty (){
    if (!this.dirty)
      return false

    this.current.write('\x03')
    this.dirty = false
    this.callbacks.unshift({skip:true})
    return true
  }
  inArrayBuffer (buffer){
    let uint8 = new Uint8Array(buffer)

    console.log(uint8)
    if (this.callbacks.length > 0){
      let call = this.callbacks[0]
      if (uint8.length == 2){
        if (uint8[0] | (uint8[1] << 8) == 0) {
          console.log('Channel: End of text detected')
          // tell that the next buffer is the ending of text,
          // probably the header as a footer.
          call.cmd[0] = 0x03
          return
        }
      }
      console.log(call, uint8, call.cmd, call.uid)
      try {
        if (call.uid) {
          call.fun.apply(
           call.self, [uint8, call.cmd, call.uid]
          )
        } else {
          call.fun.apply(
            call.self, [uint8, call.cmd]
          )
        }
      } catch (e){
        console.error(e)
      }

      this.callbacks.shift()
    }
  }
  inString (chunk){
    //data comes in chunks, keep last 4 chars to check MicroPython REPL string
    this.output += chunk
    window.bipes.page.prompt.write(chunk)
    this.ping.on = true
    if (this.output.substring(this.output.length - 4) == ">>> "){
      this.output = this.output.substring(0, this.output.length - 4)
      //After all code was executed
      if (this.callbacks.length > 0)
        this.handleCallback(this.output)
      else {
        this.output = ''
        this.lock = false
      }
    }
  }
}

function _WebSerial (parent){
  this.name = 'WebSerial'
  this.port
  this.config = {
    baudrate:115200,
    packetSize:100
  }
  this.encoder = new TextEncoder()
  this.parent = parent
  /**
   * Connect using webserial protocol, will ask user permission for the serial port.
   */
  this.connect = (callback) => {
    if (navigator.serial == undefined)
      return false

    navigator.serial.requestPort().then((port) => {
      this.port = port
      this.port.open({baudRate: [this.config.baudrate] }).then(() => {
        const appendStream = new WritableStream({
          write(chunk) {
            if (typeof chunk == 'string') {
              window.bipes.channel.inString(chunk)
            }
          },
          abort(e){
            window.bipes.channel._disconnected()
          }
        })
        this.port.readable
        .pipeThrough(new TextDecoderStream())
        .pipeTo(appendStream)
        this.parent._connected('webserial', callback)
        return true

      }).catch((e) => {
        console.error(e)
        if (e.code == 11) {
          this.parent._connected('webserial', callback)
          return true
        }
      })
    }).catch((e) => {
      console.error(e)
      return false
    })
  }
  /**
   * Disconnect device connected with webserial protocol.
   * @param {boolean} force - Try to disconnect at all cost and if fails, pretend
   *                          it worked (useful on unload when everything is cleared anyway)
   */
  this.disconnect = (force) => {
    const writer = this.port.writable.getWriter()
    writer.close().then(() => {
      this.port.close().then(() => {
          this.port = undefined
        }).catch((e) => {
          console.error(e)
          if (force == true){
            writer.abort()
            this.parent._disconnected()
            this.port = undefined
          }
        })
        return true
    })
  }
  /**
   * Runs every 50ms to check if there is code to be sent in the :js:attr:`channel#input` (appended with :js:func:`this.parent.push()`)
   */
  this.watch = () => {
    if (this.port && this.port.writable && this.port.writable.locked == false && this.parent.lock == false) {
      if (this.parent.input.length > 0) {
        if (this.parent.isDirty())
          return
        try {
          this.parent.lock = true
          this.write(this.parent.input [0])
          this.parent.input.shift()
        } catch (e) {
          console.error(e)
        }
      }
    }
  }
  /**
   * Directly send code via webserial, normally called by this.watch()
   * @param {(Uint8Array|string|number)} data - code to be sent via webserial
   */
  this.write = async (data) => {
    if (data.constructor.name != 'Array')
      data = [data]

    let dataArrayBuffer = undefined
    for (const pack of data){
      switch (pack.constructor.name) {
        case 'Uint8Array':
          dataArrayBuffer = pack
        break;
        case 'String':
        case 'Number':
          dataArrayBuffer = this.encoder.encode(pack)
        break;
      }
      if (this.port && this.port.writable && dataArrayBuffer != undefined) {
        const writer = this.port.writable.getWriter()
        // Execution is paused until writer wrote dataArrayBuffer
        let response = await writer.write(dataArrayBuffer)
        writer.releaseLock()
      }
    }
    // If no callback expected, release lock
    if (this.parent.callbacks.length == 0)
      this.parent.lock = false
  }
}

function _WebSocket (parent){
  this.name = 'WebSocket'
  this.parent = parent
  this.ws
  this.encoder = new TextEncoder()
  this.config = {
    packetSize:100
  }
  /**
   * Connect using websocket protocol.
   */
  this.connect = (callback, conf) => {
    if (WebSocket == undefined)
      return false

    this.ws = new WebSocket(conf.url)
    this.ws.binaryType = 'arraybuffer';
    this.ws.onopen = () => {
      this.ws.send(`${conf.passwd}\n\n`)
      this.parent._connected('websocket', callback)
      this.ws.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer){
          window.bipes.channel.inArrayBuffer(event.data)
        }
        if (typeof event.data == 'string'){
          window.bipes.channel.inString(event.data)

          if (event.data.includes("Access denied"))
            window.bipes.page.notification.send("Wrong board password")
        }
      }
    }
    this.ws.onclose = () => {
      // onclose might be called even if onpen didn't exec
      if (this.parent.current != undefined)
        this.parent._disconnected()
    }

  }
  /**
   * Disconnect device connected with websocket protocol.
   */
  this.disconnect = (force) => {
    this.ws.close()
    this.parent._disconnected()
  }
  /**
   * Runs every 50ms to check if there is code to be sent in the :js:attr:`channel#input` (appended with :js:func:`this.parent.push()`)
   */
  this.watch = () => {
    if (this.ws.bufferedAmount == 0) {
      if (this.parent.input.length > 0) {
        if (this.parent.isDirty())
          return
        try {
          this.parent.lock = true
          this.write (this.parent.input[0]);
          this.parent.input.shift();
        } catch (e) {
          console.error(e);
        }
      }
    }
  }
  /**
   * Directly send code via websocket, normally called by this.watch()
   * @param {(Uint8Array|string|number)} data - code to be sent via websocket
   */
  this.write = async (data) => {
    if (data.constructor.name != 'Array')
      data = [data]

    let dataArrayBuffer = undefined
    for (const pack of data){
      if (this.ws.bufferedAmount == 0) {
        if (['Uint8Array', 'String', 'Number'].includes(pack.constructor.name))
          await this.ws.send(pack)
      }
    }
    // If no callback expected, release lock
    if (this.parent.callbacks.length == 0)
      this.parent.lock = false
  }
}

export let channel = new Channel()
