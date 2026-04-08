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
          backgroundColor: "#071c0d",
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
            width: 700,
            height: 700,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(22,163,74,0.25) 0%, transparent 65%)",
          }}
        />

        {/* Icon */}
        <div
          style={{
            width: 96,
            height: 96,
            borderRadius: "50%",
            background: "rgba(22,163,74,0.2)",
            border: "1.5px solid rgba(22,163,74,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 52,
          }}
        >
          ⛳
        </div>

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
            color: "#4ade80",
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
