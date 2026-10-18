
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from uuid import uuid4
from datetime import datetime, timezone

import sqlite3


# ==========================================
# KRISH CAB - FASTAPI APPLICATION
# ==========================================

app = FastAPI(title="Krish Cab API")

DATABASE_NAME = "krishcab.db"


# ==========================================
# CORS CONFIGURATION
# ==========================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://cab-booking-platform-m7r2.vercel.app",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://cab-booking-platform.vercel.app",
        "https://cab-booking-platform-git-main-shruthi18.vercel.app",
        "https://cab-booking-platform-y33o.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ==========================================
# DATABASE INITIALIZATION
# ==========================================

def init_db():
    connection = sqlite3.connect(DATABASE_NAME)

    try:
        # Create bookings table
        connection.execute("""
            CREATE TABLE IF NOT EXISTS bookings (
                booking_id TEXT PRIMARY KEY,
                pickup TEXT NOT NULL,
                destination TEXT NOT NULL,
                distance_km REAL NOT NULL,
                duration_min INTEGER NOT NULL,
                estimated_fare REAL NOT NULL,
                status TEXT NOT NULL
            )
        """)

        # Add ride_type column if it does not exist
        columns = [
            row[1]
            for row in connection.execute(
                "PRAGMA table_info(bookings)"
            ).fetchall()
        ]

        if "ride_type" not in columns:
            connection.execute("""
                ALTER TABLE bookings
                ADD COLUMN ride_type TEXT NOT NULL DEFAULT 'Mini'
            """)

        # Create SOS alerts table
        connection.execute("""
            CREATE TABLE IF NOT EXISTS sos_alerts (
                sos_id TEXT PRIMARY KEY,
                booking_id TEXT NOT NULL,
                message TEXT NOT NULL,
                created_at TEXT NOT NULL,
                status TEXT NOT NULL,
                FOREIGN KEY (booking_id)
                    REFERENCES bookings (booking_id)
            )
        """)

        connection.commit()

    finally:
        connection.close()


init_db()


# ==========================================
# BOOKING REQUEST MODEL
# ==========================================

class BookingRequest(BaseModel):
    pickup: str
    destination: str
    distance_km: float
    duration_min: int
    ride_type: str = "Mini"


# ==========================================
# FARE CALCULATION
# ==========================================

def calculate_fare(
    distance_km: float,
    duration_min: int
):
    return round(
        40 + (distance_km * 15) + (duration_min * 2),
        2
    )


# ==========================================
# HOMEPAGE
# ==========================================

@app.get("/")
def home():
    return {
        "message": "Welcome to Krish Cab!"
    }


# ==========================================
# HEALTH CHECK
# ==========================================

@app.get("/health")
def health():
    return {
        "status": "healthy"
    }


# ==========================================
# FARE ESTIMATION API
# ==========================================

@app.get("/api/fare-estimate")
def fare_estimate(
    distance_km: float,
    duration_min: int
):
    if distance_km <= 0 or duration_min <= 0:
        raise HTTPException(
            status_code=400,
            detail="Distance and duration must be positive."
        )

    fare = calculate_fare(
        distance_km,
        duration_min
    )

    return {
        "distance_km": distance_km,
        "duration_min": duration_min,
        "estimated_fare": fare,
        "currency": "INR"
    }


# ==========================================
# CREATE A BOOKING
# ==========================================

@app.post("/api/bookings")
def create_booking(booking: BookingRequest):

    pickup = booking.pickup.strip()
    destination = booking.destination.strip()
    ride_type = booking.ride_type.strip()

    if not pickup or not destination:
        raise HTTPException(
            status_code=400,
            detail="Pickup and destination are required."
        )

    if (
        booking.distance_km <= 0
        or booking.duration_min <= 0
    ):
        raise HTTPException(
            status_code=400,
            detail="Distance and duration must be positive."
        )

    if ride_type not in ["Mini", "Sedan", "SUV"]:
        raise HTTPException(
            status_code=400,
            detail="Invalid cab type. Choose Mini, Sedan, or SUV."
        )

    fare = calculate_fare(
        booking.distance_km,
        booking.duration_min
    )

    new_booking = {
        "booking_id": f"KC-{str(uuid4())[:6].upper()}",
        "pickup": pickup,
        "destination": destination,
        "distance_km": booking.distance_km,
        "duration_min": booking.duration_min,
        "ride_type": ride_type,
        "estimated_fare": fare,
        "status": "Confirmed"
    }

    connection = sqlite3.connect(DATABASE_NAME)

    try:
        connection.execute(
            """
            INSERT INTO bookings (
                booking_id,
                pickup,
                destination,
                distance_km,
                duration_min,
                ride_type,
                estimated_fare,
                status
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                new_booking["booking_id"],
                new_booking["pickup"],
                new_booking["destination"],
                new_booking["distance_km"],
                new_booking["duration_min"],
                new_booking["ride_type"],
                new_booking["estimated_fare"],
                new_booking["status"]
            )
        )

        connection.commit()

    finally:
        connection.close()

    return new_booking


# ==========================================
# RETRIEVE ALL BOOKINGS
# ==========================================

@app.get("/api/bookings")
def get_bookings():

    connection = sqlite3.connect(DATABASE_NAME)
    connection.row_factory = sqlite3.Row

    try:
        rows = connection.execute(
            """
            SELECT
                booking_id,
                pickup,
                destination,
                distance_km,
                duration_min,
                ride_type,
                estimated_fare,
                status
            FROM bookings
            ORDER BY rowid DESC
            """
        ).fetchall()

        return [dict(row) for row in rows]

    finally:
        connection.close()


# ==========================================
# CANCEL A BOOKING
# ==========================================

@app.patch("/api/bookings/{booking_id}/cancel")
def cancel_booking(booking_id: str):

    booking_id = booking_id.strip().upper()

    connection = sqlite3.connect(DATABASE_NAME)
    connection.row_factory = sqlite3.Row

    try:
        row = connection.execute(
            """
            SELECT *
            FROM bookings
            WHERE booking_id = ?
            """,
            (booking_id,)
        ).fetchone()

        if row is None:
            raise HTTPException(
                status_code=404,
                detail="Booking not found."
            )

        if row["status"] == "Cancelled":
            raise HTTPException(
                status_code=400,
                detail="This booking is already cancelled."
            )

        connection.execute(
            """
            UPDATE bookings
            SET status = ?
            WHERE booking_id = ?
            """,
            ("Cancelled", booking_id)
        )

        connection.commit()

        return {
            "booking_id": booking_id,
            "status": "Cancelled",
            "message": "Your ride has been cancelled successfully."
        }

    finally:
        connection.close()


# ==========================================
# SEARCH BOOKING BY BOOKING ID
# ==========================================

@app.get("/api/bookings/{booking_id}")
def get_booking_by_id(booking_id: str):

    connection = sqlite3.connect(DATABASE_NAME)
    connection.row_factory = sqlite3.Row

    try:
        row = connection.execute(
            """
            SELECT
                booking_id,
                pickup,
                destination,
                distance_km,
                duration_min,
                ride_type,
                estimated_fare,
                status
            FROM bookings
            WHERE booking_id = ?
            """,
            (booking_id.strip().upper(),)
        ).fetchone()

        if row is None:
            raise HTTPException(
                status_code=404,
                detail="Booking not found. Please check your booking ID."
            )

        return dict(row)

    finally:
        connection.close()


# ==========================================
# SOS EMERGENCY REQUEST
# ==========================================

@app.post("/api/bookings/{booking_id}/sos")
def create_sos_alert(booking_id: str):

    booking_id = booking_id.strip().upper()

    connection = sqlite3.connect(DATABASE_NAME)
    connection.row_factory = sqlite3.Row

    try:
        # Verify that the booking exists
        booking = connection.execute(
            """
            SELECT booking_id
            FROM bookings
            WHERE booking_id = ?
            """,
            (booking_id,)
        ).fetchone()

        if booking is None:
            raise HTTPException(
                status_code=404,
                detail="Booking not found."
            )

        # Create SOS request details
        sos_id = f"SOS-{str(uuid4())[:8].upper()}"
        created_at = datetime.now(timezone.utc).isoformat()

        message = (
            f"Emergency assistance requested for booking {booking_id}"
        )

        # Save SOS request in the database
        connection.execute(
            """
            INSERT INTO sos_alerts (
                sos_id,
                booking_id,
                message,
                created_at,
                status
            )
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                sos_id,
                booking_id,
                message,
                created_at,
                "Recorded"
            )
        )

        connection.commit()

        return {
            "sos_id": sos_id,
            "booking_id": booking_id,
            "status": "Recorded",
            "created_at": created_at,
            "message": (
                "SOS request recorded in Krish Cab. "
                "No emergency services have been contacted."
            )
        }

    finally:
        connection.close()
