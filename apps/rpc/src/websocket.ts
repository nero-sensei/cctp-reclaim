import { rejection, subscriptions, track } from "./subscriptions.ts";

function websocketHeaders(request: Request): Headers {
  const headers = new Headers({ upgrade: "websocket" });
  for (const name of ["sec-websocket-key", "sec-websocket-version", "sec-websocket-protocol"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  return headers;
}

export async function proxyWebSocket(upstream: string, request: Request): Promise<Response | null> {
  const response = await fetch(upstream, { headers: websocketHeaders(request) });
  const remote = response.webSocket;
  if (!remote) {
    await response.body?.cancel();
    return null;
  }

  const pair = new WebSocketPair();
  const [client, local] = [pair[0], pair[1]];
  local.accept();
  remote.accept();

  const closeBoth = () => {
    for (const socket of [local, remote]) {
      try {
        socket.close();
      } catch {}
    }
  };
  const send = (socket: WebSocket, data: string | ArrayBuffer) => {
    try {
      socket.send(data);
    } catch {
      closeBoth();
    }
  };

  const state = subscriptions();
  remote.addEventListener("message", ({ data }) => {
    track(state, data);
    send(local, data);
  });
  local.addEventListener("message", ({ data }) => {
    const reply = rejection(state, data);
    if (reply) send(local, reply);
    else send(remote, data);
  });
  for (const socket of [local, remote]) {
    socket.addEventListener("close", closeBoth);
    socket.addEventListener("error", closeBoth);
  }

  return new Response(null, { status: 101, webSocket: client });
}
