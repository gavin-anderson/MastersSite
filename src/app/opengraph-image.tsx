import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "The Masters Pool";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#04120a",
          gap: 24,
        }}
      >
        {/* Glow */}
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: 600,
            height: 600,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(22,163,74,0.18) 0%, transparent 70%)",
          }}
        />

        {/* Icon */}
        <div style={{ fontSize: 120, lineHeight: 1 }}>⛳</div>

        {/* Title */}
        <div
          style={{
            fontSize: 64,
            fontWeight: 700,
            color: "#f0fdf4",
            letterSpacing: "-1px",
          }}
        >
          The Masters Pool
        </div>

        {/* Subtitle */}
        <div
          style={{
            fontSize: 28,
            color: "#6b8a72",
            letterSpacing: "0.5px",
          }}
        >
          3putt.ca
        </div>
      </div>
    ),
    { ...size }
  );
}
