import { useEffect, useRef } from "react";
import "./App.css";
import { Device } from "mediasoup-client";

function App() {
  const deviceRef = useRef<Device | null>(null);
  const sendTransportRef = useRef<any>(null);
  const socketRef = useRef<any>(null);
  const videoRef = useRef<any>(null);

  useEffect(() => {
    const socket = new WebSocket("ws://localhost:8082");
    socketRef.current = socket;

    socket.onopen = () => {
      console.log("Connect");

      socket.send(JSON.stringify({ type: "create-transport" }));
    };

    socket.onmessage = async (event) => {
      const response = JSON.parse(event.data);

      if (response.type === "transport-created") {
        await handleTransportCreated(response.data);
      }
    };
  }, []);

  async function handleTransportCreated(data: any) {
    const {
      id,
      iceParameters,
      iceCandidates,
      dtlsParameters,
      routerRtpCapabilities,
    } = data;

    if (!deviceRef.current) {
      const device = new Device();

      await device.load({
        routerRtpCapabilities,
      });

      deviceRef.current = device;
    }

    const device = deviceRef.current;

    const sendTransport = device.createSendTransport({
      id,
      iceParameters,
      iceCandidates,
      dtlsParameters,
    });

    sendTransportRef.current = sendTransport;

    console.log("Send Transport Created");
    sendTransport.on(
      "connect",
      async ({ dtlsParameters }, callback, errback) => {
        try {
          socketRef.current?.send(
            JSON.stringify({
              type: "connect-transport",
              data: {
                transportId: sendTransport.id,
                dtlsParameters,
              },
            }),
          );

          callback();
          console.log("✅ Send Transport Connected");
        } catch (err) {
          errback(err as Error);
        }
      },
    );

    sendTransport.on("produce", async (parameters, callback, errback) => {
      try {
        console.log("🔥 Produce fired");

        socketRef.current?.send(
          JSON.stringify({
            type: "produce",
            data: {
              transportId: sendTransport.id,
              kind: parameters.kind,
              rtpParameters: parameters.rtpParameters,
            },
          }),
        );

        callback({
          id: crypto.randomUUID(),
        });

        console.log("✅ Producer Created");
      } catch (error) {
        errback(error as Error);
      }
    });

    socketRef.current?.send(
      JSON.stringify({
        type: "create-recv-transport",
      }),
    );
  }

  const startVideo = async () => {
    const sendTransport = sendTransportRef.current;

    if (!sendTransport) {
      console.log("❌ Transport not ready");
      return;
    }

    // Get user media (camera + mic)
    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });

    console.log("✅ Camera Stream", stream);

    const videoTrack = stream.getVideoTracks()[0];

    // Show local preview
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }

    const producer = await sendTransport.produce({
      track: videoTrack,
    });

    console.log("✅ Producing Video", producer);
  };

  return (
    <>
      <div>
        <video ref={videoRef} autoPlay playsInline width={400}></video>
        <button onClick={startVideo}>Start video</button>
      </div>
    </>
  );
}

export default App;
