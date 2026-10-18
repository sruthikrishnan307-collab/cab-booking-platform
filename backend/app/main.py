
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from uuid import uuid4

import sqlite3
import math
import requests
GEOCODING_CACHE = {}


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
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://cab-booking-platform.vercel.app",
        "https://cab-booking-platform-git-main-shruthi18.vercel.app",
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
# NEARBY PLACES CATEGORY FILTERS
# ==========================================

CATEGORY_FILTERS = {
    "temples": [
        ('["amenity"="place_of_worship"]',
         "Temple / Place of Worship")
    ],

    "cafes": [
        ('["amenity"="cafe"]', "Cafe")
    ],

    "restaurants": [
        ('["amenity"="restaurant"]', "Restaurant")
    ],

    "attractions": [
        ('["tourism"="attraction"]', "Tourist Attraction"),
        ('["historic"="monument"]', "Historical Monument"),
        ('["leisure"="park"]', "Park")
    ],

    "shopping": [
        ('["shop"="mall"]', "Shopping Mall"),
        ('["amenity"="marketplace"]', "Market")
    ],

    "all": [
        ('["amenity"="place_of_worship"]',
         "Temple / Place of Worship"),
        ('["amenity"="cafe"]', "Cafe"),
        ('["amenity"="restaurant"]', "Restaurant"),
        ('["tourism"="attraction"]', "Tourist Attraction"),
        ('["historic"="monument"]', "Historical Monument"),
        ('["leisure"="park"]', "Park"),
        ('["shop"="mall"]', "Shopping Mall"),
        ('["amenity"="marketplace"]', "Market")
    ]
}


# ==========================================
# CALCULATE DISTANCE BETWEEN TWO LOCATIONS
# ==========================================

def calculate_distance(
    lat1,
    lon1,
    lat2,
    lon2
):
    """Calculate straight-line distance in kilometres."""

    earth_radius = 6371

    lat1, lon1, lat2, lon2 = map(
        math.radians,
        [lat1, lon1, lat2, lon2]
    )

    dlat = lat2 - lat1
    dlon = lon2 - lon1

    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(lat1)
        * math.cos(lat2)
        * math.sin(dlon / 2) ** 2
    )

    a = max(0.0, min(1.0, a))

    c = 2 * math.atan2(
        math.sqrt(a),
        math.sqrt(1 - a)
    )

    return earth_radius * c


# ==========================================
# FIND NEARBY PLACES
# ==========================================

@app.get("/api/nearby-places")
def get_nearby_places(
    destination: str = Query(
        ...,
        min_length=2,
        max_length=200
    ),
    radius_km: float = Query(
        5,
        ge=1,
        le=10
    ),
    category: str = Query("all")
):
    print("========== NEARBY PLACES CALLED ==========")
    print("DESTINATION:", destination)

    destination = destination.strip()
    category = category.lower().strip()

    if not destination:
        raise HTTPException(
            status_code=400,
            detail="Please enter a destination."
        )

    if category not in CATEGORY_FILTERS:
        raise HTTPException(
            status_code=400,
            detail=(
                "Invalid category. Choose all, temples, cafes, "
                "restaurants, attractions, or shopping."
            )
        )

    headers = {
        "User-Agent": "KrishCabStudentProject/1.0 (nearby places)"
    }

    # --------------------------------------
    # STEP 1: GEOCODE THE DESTINATION
    # --------------------------------------

    # --------------------------------------
    # STEP 1: GEOCODE THE DESTINATION
    # --------------------------------------

        # --------------------------------------
    # STEP 1: GEOCODE THE DESTINATION
    # --------------------------------------

    cache_key = destination.casefold().strip()

    if cache_key in GEOCODING_CACHE:
        geo_data = GEOCODING_CACHE[cache_key]
        print("Using cached geocoding result:", destination)

    else:
        try:
            geo_response = requests.get(
                "https://nominatim.openstreetmap.org/search",
                params={
                    "q": destination,
                    "format": "jsonv2",
                    "limit": 5,
                    "countrycodes": "in",
                    "addressdetails": 1
                },
                headers=headers,
                timeout=20
            )

            geo_response.raise_for_status()
            geo_data = geo_response.json()

            if not isinstance(geo_data, list):
                raise ValueError(
                    "Unexpected response from geocoding service."
                )

            # Cache only successful, non-empty results.
            if geo_data:
                GEOCODING_CACHE[cache_key] = geo_data

            print("Destination entered:", destination)
            print("Nominatim results:")

            for place in geo_data:
                print(
                    place.get("display_name"),
                    place.get("address", {})
                )

        except (requests.RequestException, ValueError) as e:
            print("========== GEOCODING ERROR ==========")
            print("Destination:", destination)
            print("Error type:", type(e).__name__)
            print("Error:", repr(e))
            print("====================================")

            raise HTTPException(
                status_code=502,
                detail=(
                    "Unable to search for the destination. "
                    "Please try again later."
                )
            )

    if not geo_data:
        raise HTTPException(
            status_code=404,
            detail=(
                "Destination not found. "
                "Please enter a valid location."
            )
        )

      # Select the most relevant destination returned by Nominatim.
    selected_location = None

    destination_normalized = destination.strip().casefold()

    for place in geo_data:
        address = place.get("address", {})

        display_name = place.get("display_name", "").casefold()

        city = (
            address.get("city")
            or address.get("town")
            or address.get("municipality")
            or ""
        ).casefold()

        state = address.get("state", "").casefold()

        # Prefer results located in Bengaluru, Karnataka.
        is_bengaluru = (
            "bengaluru" in display_name
            or "bangalore" in display_name
            or "bengaluru" in city
            or "bangalore" in city
        )

        is_karnataka = "karnataka" in state

        if is_bengaluru and is_karnataka:
            selected_location = place
            break

    if selected_location is None:
        raise HTTPException(
            status_code=404,
            detail=(
                "Destination not found in Bengaluru. "
                "Try entering the neighbourhood with Bengaluru, "
                "for example: Koramangala, Bengaluru, Karnataka, India."
            )
        )

    latitude = float(selected_location["lat"])
    longitude = float(selected_location["lon"])

    print(
        f"Requested destination: {destination} | "
        f"Matched location: {selected_location.get('display_name')} | "
        f"Coordinates: {latitude}, {longitude}"
    )



    # --------------------------------------
    # STEP 2: BUILD OVERPASS QUERY
    # --------------------------------------

    radius_meters = int(radius_km * 1000)

    selectors = CATEGORY_FILTERS[category]

    query_parts = []

    for tag_filter, _ in selectors:
        query_parts.append(
            f'nwr(around:{radius_meters},{latitude},'
            f'{longitude}){tag_filter};'
        )

    overpass_query = (
        "[out:json][timeout:25];("
        + "".join(query_parts)
        + ");out center tags;"
    )

    # --------------------------------------
    # STEP 3: QUERY OVERPASS SERVERS
    # --------------------------------------

    # --------------------------------------
# STEP 3: QUERY OVERPASS SERVERS
# --------------------------------------

    OVERPASS_URLS = [
        "https://overpass-api.de/api/interpreter",
        "https://overpass.kumi.systems/api/interpreter",
    ]

    places_data = None
    overpass_errors = []

    for server in OVERPASS_URLS:

        try:
            print(f"Searching nearby places: {server}")

            places_response = requests.post(
                server,
                data={"data": overpass_query},
                headers=headers,
                timeout=45
            )

            print(
                f"Overpass status from {server}: "
                f"{places_response.status_code}"
            )

            places_response.raise_for_status()

            response_data = places_response.json()

            if not isinstance(response_data, dict):
                raise ValueError(
                    "Unexpected response from Overpass."
                )

            if "elements" not in response_data:
                raise ValueError(
                    "Overpass response does not contain elements."
                )

            places_data = response_data

            print(f"Overpass request succeeded: {server}")

            break

        except requests.RequestException as e:

            error_message = (
                f"{server} -> "
                f"{type(e).__name__}: {str(e)}"
            )

            print("OVERPASS REQUEST ERROR:")
            print(error_message)

            overpass_errors.append(error_message)

        except ValueError as e:

            error_message = (
                f"{server} -> "
                f"{type(e).__name__}: {str(e)}"
            )

            print("OVERPASS RESPONSE ERROR:")
            print(error_message)

            overpass_errors.append(error_message)


    if places_data is None:

        print("========== ALL OVERPASS SERVERS FAILED ==========")

        for error in overpass_errors:
            print(error)

        print("=================================================")

        raise HTTPException(
            status_code=503,
            detail=(
                "Nearby places service is temporarily unavailable. "
                "Please try again later."
            )
        )

    # --------------------------------------
    # STEP 4: PROCESS AND DEDUPLICATE RESULTS
    # --------------------------------------

    places = []

    seen_osm_ids = set()
    seen_place_locations = set()

    for item in places_data.get("elements", []):

        tags = item.get("tags", {})

        name = (
            tags.get("name")
            or tags.get("name:en")
        )

        if not name:
            continue

        # Extract coordinates.
        place_lat = item.get("lat")
        place_lon = item.get("lon")

        if place_lat is None or place_lon is None:
            center = item.get("center", {})

            place_lat = center.get("lat")
            place_lon = center.get("lon")

        if place_lat is None or place_lon is None:
            continue

        place_lat = float(place_lat)
        place_lon = float(place_lon)

        # Calculate distance from destination.
        distance = calculate_distance(
            latitude,
            longitude,
            place_lat,
            place_lon
        )

        if distance > radius_km:
            continue

        # Remove duplicate OpenStreetMap elements.
        osm_id = (
            item.get("type"),
            item.get("id")
        )

        if osm_id in seen_osm_ids:
            continue

        seen_osm_ids.add(osm_id)

        # Remove entries with the same name and nearly
        # identical coordinates.
        location_key = (
            name.strip().casefold(),
            round(place_lat, 4),
            round(place_lon, 4)
        )

        if location_key in seen_place_locations:
            continue

        seen_place_locations.add(location_key)

        # Identify category.
        if tags.get("amenity") == "place_of_worship":
            place_category = "Temple / Place of Worship"

        elif tags.get("amenity") == "cafe":
            place_category = "Cafe"

        elif tags.get("amenity") == "restaurant":
            place_category = "Restaurant"

        elif tags.get("tourism") == "attraction":
            place_category = "Tourist Attraction"

        elif tags.get("historic") == "monument":
            place_category = "Historical Monument"

        elif tags.get("leisure") == "park":
            place_category = "Park"

        elif tags.get("shop") == "mall":
            place_category = "Shopping Mall"

        elif tags.get("amenity") == "marketplace":
            place_category = "Market"

        else:
            continue

        map_url = (
            "https://www.openstreetmap.org/"
            f"?mlat={place_lat}&mlon={place_lon}"
            f"#map=17/{place_lat}/{place_lon}"
        )

        places.append({
            "name": name.strip(),
            "category": place_category,
            "distance_km": round(distance, 2),
            "latitude": place_lat,
            "longitude": place_lon,
            "map_url": map_url
        })

    # Sort nearest places first.
    places.sort(
        key=lambda place: place["distance_km"]
    )

    # Limit results.
    places = places[:20]

    # --------------------------------------
    # STEP 5: RETURN RESULTS
    # --------------------------------------

    return {
        "destination": destination,
        "radius_km": radius_km,
        "category": category,
        "total_places": len(places),
        "places": places
    }
