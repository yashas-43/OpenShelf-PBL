import mongoose from "mongoose";

export function getHealth(_req, res) {
  const readyState = mongoose.connection.readyState;
  const states = ["disconnected", "connected", "connecting", "disconnecting"];
  const databaseStatus = states[readyState] || "unknown";

  res.status(200).json({
    success: true,
    service: "OpenShelf API",
    status: "online",
    timestamp: new Date().toISOString(),
    database: { status: databaseStatus },
    message: databaseStatus === "connected"
      ? "API and MongoDB are ready."
      : "API is online; MongoDB is not connected yet. Check server/.env and your database service."
  });
}
