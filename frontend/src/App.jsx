
import { useCallback, useEffect, useState } from "react";
import "./App.css";

const API_URL = "http://127.0.0.1:8000";

function App() {
  // Form states
  const [pickup, setPickup] = useState("");
  const [drop, setDrop] = useState("");
  const [distance, setDistance] = useState("5");
  const [duration, setDuration] = useState("15");
  const [rideType, setRideType] = useState("Mini");

  // Application data
  const [fare, setFare] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [tracking, setTracking] = useState(null);
  const [nearbyPlaces, setNearbyPlaces] = useState([]);

  // Nearby Places filters
  const [nearbyCategory, setNearbyCategory] = useState("all");
  const [nearbyRadius, setNearbyRadius] = useState("5");

  // Loading states
  const [loadingFare, setLoadingFare] = useState(false);
  const [loadingBooking, setLoadingBooking] = useState(false);
  const [loadingBookings, setLoadingBookings] = useState(true);
  const [loadingNearbyPlaces, setLoadingNearbyPlaces] = useState(false);

  // Messages
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  // --------------------------------------------------
  // COMMON API REQUEST FUNCTION
  // --------------------------------------------------

  const apiRequest = useCallback(async (path, options = {}) => {
    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        ...(options.body
          ? { "Content-Type": "application/json" }
          : {}),
        ...options.headers,
      },
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const detail = data.detail ?? data.message ?? data.error;
      let errorMessage = "Something went wrong.";

      if (typeof detail === "string") {
        errorMessage = detail;
      } else if (Array.isArray(detail)) {
        errorMessage = detail
          .map((item) => {
            if (typeof item === "string") return item;

            const field = Array.isArray(item.loc)
              ? item.loc.join(" → ")
              : "";

            return [field, item.msg ?? JSON.stringify(item)]
              .filter(Boolean)
              .join(": ");
          })
          .join("; ");
      } else if (detail && typeof detail === "object") {
        errorMessage = JSON.stringify(detail);
      }

      throw new Error(errorMessage);
    }

    return data;
  }, []);

  // --------------------------------------------------
  // LOAD ALL BOOKINGS
  // --------------------------------------------------

  const loadBookings = useCallback(async () => {
    setLoadingBookings(true);

    try {
      const data = await apiRequest("/api/bookings");
      setBookings(Array.isArray(data) ? data : data.bookings || []);
    } catch (err) {
      setError(`Could not load bookings: ${err.message}`);
    } finally {
      setLoadingBookings(false);
    }
  }, [apiRequest]);

  // --------------------------------------------------
  // LOAD NEARBY PLACES
  // --------------------------------------------------

  const loadNearbyPlaces = useCallback(async () => {
    const destination = drop.trim() || pickup.trim();

    if (!destination) {
      setError("Please enter a pickup or drop location first.");
      return;
    }

    setLoadingNearbyPlaces(true);
    setError("");

    try {
      const params = new URLSearchParams({
        destination,
        radius_km: nearbyRadius,
        category: nearbyCategory,
      });

      const data = await apiRequest(
        `/api/nearby-places?${params.toString()}`
      );

      setNearbyPlaces(
        Array.isArray(data) ? data : data.places || []
      );

      setMessage(
        `Nearby places loaded: ${
          Array.isArray(data) ? data.length : data.total_places ?? 0
        } found.`
      );
    } catch (err) {
      console.error("Could not load nearby places:", err.message);
      setNearbyPlaces([]);
      setError(`Could not load nearby places: ${err.message}`);
    } finally {
      setLoadingNearbyPlaces(false);
    }
  }, [apiRequest, drop, pickup, nearbyCategory, nearbyRadius]);

  // --------------------------------------------------
  // INITIAL DATA LOADING
  // --------------------------------------------------

  useEffect(() => {
    loadBookings();
  }, [loadBookings]);

  // --------------------------------------------------
  // ESTIMATE FARE
  // --------------------------------------------------

  const estimateFare = async (event) => {
    event.preventDefault();

    setError("");
    setMessage("");
    setFare(null);

    if (!pickup.trim() || !drop.trim()) {
      setError("Please enter both pickup and drop locations.");
      return;
    }

    if (pickup.trim().toLowerCase() === drop.trim().toLowerCase()) {
      setError("Pickup and drop locations must be different.");
      return;
    }

    if (
      !distance ||
      !duration ||
      Number(distance) <= 0 ||
      Number(duration) <= 0
    ) {
      setError("Distance and duration must be greater than zero.");
      return;
    }

    setLoadingFare(true);

    try {
      const params = new URLSearchParams({
        distance_km: String(distance),
        duration_min: String(duration),
        ride_type: rideType,
      });

      const data = await apiRequest(
        `/api/fare-estimate?${params.toString()}`
      );

      setFare(data);
      setMessage("Fare estimated successfully!");
    } catch (err) {
      setError(
        `Fare estimation failed: ${err.message}. Check that your backend is running on port 8000.`
      );
    } finally {
      setLoadingFare(false);
    }
  };

  // --------------------------------------------------
  // BOOK A RIDE
  // --------------------------------------------------

  const bookRide = async () => {
    setError("");
    setMessage("");

    if (loadingBooking) return;

    if (!pickup.trim() || !drop.trim()) {
      setError("Please enter both pickup and drop locations.");
      return;
    }

    if (pickup.trim().toLowerCase() === drop.trim().toLowerCase()) {
      setError("Pickup and drop locations must be different.");
      return;
    }

    if (
      !distance ||
      !duration ||
      Number(distance) <= 0 ||
      Number(duration) <= 0
    ) {
      setError("Please enter a valid distance and duration.");
      return;
    }

    setLoadingBooking(true);

    try {
      const bookingData = {
        pickup: pickup.trim(),
        destination: drop.trim(),
        distance_km: Number(distance),
        duration_min: Number(duration),
        ride_type: rideType,
      };

      const data = await apiRequest("/api/bookings", {
        method: "POST",
        body: JSON.stringify(bookingData),
      });

      setTracking(data);
      setMessage("Your ride booking request was successful!");

      await loadBookings();
      await loadNearbyPlaces();
    } catch (err) {
      setError(`Booking failed: ${err.message}`);
    } finally {
      setLoadingBooking(false);
    }
  };

  // --------------------------------------------------
  // HELPER FUNCTIONS
  // --------------------------------------------------

  const getBookingId = (booking) => {
    if (!booking) return null;

    return (
      booking.id ??
      booking.booking_id ??
      booking.bookingId ??
      null
    );
  };

  const getFareAmount = (fareData) => {
    if (typeof fareData === "number" || typeof fareData === "string") {
      return fareData;
    }

    return (
      fareData?.fare ??
      fareData?.estimated_fare ??
      fareData?.total_fare ??
      fareData?.amount ??
      null
    );
  };

  const formatFare = (amount) => {
    const number = Number(amount);

    if (!Number.isFinite(number)) {
      return "Fare unavailable";
    }

    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 2,
    }).format(number);
  };

  // --------------------------------------------------
  // CANCEL A BOOKING
  // --------------------------------------------------

  const cancelBooking = async (bookingId) => {
    setError("");
    setMessage("");

    try {
      const data = await apiRequest(
        `/api/bookings/${bookingId}/cancel`,
        { method: "PATCH" }
      );

      setMessage("Booking cancelled successfully!");

      if (
        tracking &&
        String(getBookingId(tracking)) === String(bookingId)
      ) {
        setTracking(data);
      }

      await loadBookings();
    } catch (err) {
      setError(`Could not cancel booking: ${err.message}`);
    }
  };

  // --------------------------------------------------
  // TRACK A BOOKING
  // --------------------------------------------------

  const trackBooking = async (bookingId) => {
    setError("");
    setMessage("");

    try {
      const data = await apiRequest(`/api/bookings/${bookingId}`);
      setTracking(data);
      setMessage("Booking details loaded.");
    } catch (err) {
      setError(`Could not find booking: ${err.message}`);
    }
  };

  // --------------------------------------------------
  // USER INTERFACE
  // --------------------------------------------------

  return (
    <div className="app">
      {/* HEADER */}
      <header className="header">
        <div className="logo">🚕 Krish Cab</div>

        <nav>
          <a href="#home">Home</a>
          <a href="#book">Book a Cab</a>
          <a href="#bookings">My Bookings</a>
          <a href="#nearby">Nearby Places</a>
        </nav>
      </header>

      <main>
        {/* HERO SECTION */}
        <section className="hero" id="home">
          <div className="hero-content">
            <p className="eyebrow">YOUR JOURNEY, OUR PRIORITY</p>

            <h1>
              Your Ride.
              <br />
              Your Way.
            </h1>

            <p>
              Book your cab with Krish Cab. Get a fare estimate and
              manage your bookings in one place.
            </p>

            <a className="primary-button" href="#book">
              Book Your Ride
            </a>
          </div>

          <div className="hero-icon" aria-hidden="true">
            🚖
          </div>
        </section>

        {/* ERROR MESSAGE */}
        {error && (
          <div className="alert error-alert" role="alert">
            <strong>Error:</strong> {error}

            <button
              type="button"
              onClick={() => setError("")}
              aria-label="Dismiss error"
            >
              ×
            </button>
          </div>
        )}

        {/* SUCCESS MESSAGE */}
        {message && (
          <div className="alert success-alert" role="status">
            {message}

            <button
              type="button"
              onClick={() => setMessage("")}
              aria-label="Dismiss message"
            >
              ×
            </button>
          </div>
        )}

        {/* BOOKING SECTION */}
        <section className="section" id="book">
          <div className="section-heading">
            <p className="eyebrow">PLAN YOUR TRIP</p>
            <h2>Book a Cab</h2>
            <p>Enter your trip details to estimate the fare.</p>
          </div>

          <div className="booking-layout">
            {/* BOOKING FORM */}
            <form className="booking-card" onSubmit={estimateFare}>
              <h3>Trip Details</h3>

              <div className="form-group">
                <label htmlFor="pickup">Pickup Location</label>
                <input
                  id="pickup"
                  type="text"
                  placeholder="Enter pickup location"
                  value={pickup}
                  onChange={(event) => setPickup(event.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="drop">Drop Location</label>
                <input
                  id="drop"
                  type="text"
                  placeholder="Enter destination"
                  value={drop}
                  onChange={(event) => setDrop(event.target.value)}
                  required
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="distance">Distance (km)</label>
                  <input
                    id="distance"
                    type="number"
                    min="0.1"
                    step="any"
                    value={distance}
                    onChange={(event) => setDistance(event.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="duration">Duration (minutes)</label>
                  <input
                    id="duration"
                    type="number"
                    min="1"
                    step="any"
                    value={duration}
                    onChange={(event) => setDuration(event.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="rideType">Choose Your Cab</label>
                <select
                  id="rideType"
                  value={rideType}
                  onChange={(event) => setRideType(event.target.value)}
                >
                  <option value="Mini">Mini</option>
                  <option value="Sedan">Sedan</option>
                  <option value="SUV">SUV</option>
                </select>
              </div>

              <button
                className="primary-button full-width"
                type="submit"
                disabled={loadingFare}
              >
                {loadingFare ? "Calculating Fare..." : "Estimate Fare"}
              </button>

              <button
                className="secondary-button full-width"
                type="button"
                onClick={bookRide}
                disabled={loadingBooking}
              >
                {loadingBooking ? "Booking..." : "Book My Ride"}
              </button>
            </form>

            {/* FARE CARD */}
            <div className="fare-card">
              <div className="fare-icon">💰</div>
              <h3>Estimated Fare</h3>

              {fare !== null ? (
                <>
                  <p className="fare-amount">
                    {formatFare(getFareAmount(fare))}
                  </p>

                  <p className="muted">
                    Estimated cost for your selected ride.
                  </p>

                  <div className="fare-details">
                    <div>
                      <span>Pickup</span>
                      <strong>{pickup || "Not entered"}</strong>
                    </div>
                    <div>
                      <span>Destination</span>
                      <strong>{drop || "Not entered"}</strong>
                    </div>
                    <div>
                      <span>Distance</span>
                      <strong>{distance} km</strong>
                    </div>
                    <div>
                      <span>Duration</span>
                      <strong>{duration} minutes</strong>
                    </div>
                    <div>
                      <span>Cab Type</span>
                      <strong>{rideType}</strong>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="primary-button full-width"
                    onClick={bookRide}
                    disabled={loadingBooking}
                  >
                    {loadingBooking ? "Booking..." : "Confirm Booking"}
                  </button>
                </>
              ) : (
                <p className="muted">
                  Your estimated fare will appear here after you submit
                  your trip details.
                </p>
              )}
            </div>
          </div>
        </section>

        {/* BOOKING DETAILS AND TRACKING */}
        {tracking && (
          <section className="section tracking-section">
            <div className="section-heading">
              <p className="eyebrow">RIDE INFORMATION</p>
              <h2>Booking Details</h2>
            </div>

            <div className="tracking-card">
              <div>
                <span>Booking ID</span>
                <strong>{getBookingId(tracking) ?? "Not provided"}</strong>
              </div>

              <div>
                <span>Pickup</span>
                <strong>
                  {tracking.pickup ?? tracking.pickup_location ?? pickup}
                </strong>
              </div>

              <div>
                <span>Destination</span>
                <strong>
                  {tracking.drop ??
                    tracking.drop_location ??
                    tracking.destination ??
                    drop}
                </strong>
              </div>

              <div>
                <span>Cab Type</span>
                <strong>
                  {tracking.ride_type ??
                    tracking.rideType ??
                    tracking.cab_type ??
                    tracking.vehicle_type ??
                    rideType}
                </strong>
              </div>

              <div>
                <span>Status</span>
                <strong className="status">
                  {tracking.status ?? "Booking received"}
                </strong>
              </div>

              {(tracking.fare ??
                tracking.estimated_fare ??
                tracking.total_fare) != null && (
                <div>
                  <span>Fare</span>
                  <strong>
                    {formatFare(
                      tracking.fare ??
                        tracking.estimated_fare ??
                        tracking.total_fare
                    )}
                  </strong>
                </div>
              )}
            </div>
          </section>
        )}

        {/* BOOKING HISTORY */}
        <section className="section" id="bookings">
          <div className="section-heading">
            <p className="eyebrow">YOUR TRIPS</p>
            <h2>My Bookings</h2>
            <p>View and manage your cab bookings.</p>
          </div>

          <div className="bookings-card">
            {loadingBookings && bookings.length === 0 ? (
              <p className="empty-state">Loading your bookings...</p>
            ) : bookings.length === 0 ? (
              <p className="empty-state">
                No bookings available yet. Book your first ride!
              </p>
            ) : (
              <div className="bookings-list">
                {bookings.map((booking, index) => {
                  const bookingId = getBookingId(booking);
                  const status = String(
                    booking.status ?? "Pending"
                  ).toLowerCase();
                  const isCancelled = status.includes("cancel");

                  return (
                    <article
                      className="booking-item"
                      key={bookingId ?? index}
                    >
                      <div className="booking-item-info">
                        <h3>
                          {booking.pickup ??
                            booking.pickup_location ??
                            "Pickup"}
                          {" → "}
                          {booking.drop ??
                            booking.drop_location ??
                            booking.destination ??
                            "Destination"}
                        </h3>

                        <p>Booking ID: {bookingId ?? "Not provided"}</p>

                        <p>
                          Cab Type:{" "}
                          {booking.ride_type ??
                            booking.rideType ??
                            booking.cab_type ??
                            booking.vehicle_type ??
                            "Not specified"}
                        </p>

                        {(booking.fare ??
                          booking.estimated_fare ??
                          booking.total_fare) != null && (
                          <p>
                            Fare:{" "}
                            {formatFare(
                              booking.fare ??
                                booking.estimated_fare ??
                                booking.total_fare
                            )}
                          </p>
                        )}

                        <span
                          className={`booking-status ${
                            isCancelled ? "cancelled" : ""
                          }`}
                        >
                          {booking.status ?? "Pending"}
                        </span>
                      </div>

                      <div className="booking-actions">
                        {bookingId != null && (
                          <button
                            type="button"
                            className="secondary-button"
                            onClick={() => trackBooking(bookingId)}
                          >
                            View Details
                          </button>
                        )}

                        {bookingId != null && !isCancelled && (
                          <button
                            type="button"
                            className="danger-button"
                            onClick={() => cancelBooking(bookingId)}
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}

            <button
              type="button"
              className="secondary-button refresh-button"
              onClick={loadBookings}
              disabled={loadingBookings}
            >
              {loadingBookings ? "Refreshing..." : "Refresh Bookings"}
            </button>
          </div>
        </section>

        {/* NEARBY PLACES */}
        <section className="section" id="nearby">
          <div className="section-heading">
            <p className="eyebrow">EXPLORE AROUND YOU</p>
            <h2>Nearby Places</h2>
            <p>Choose a category and explore places near your destination.</p>
          </div>

          <div className="booking-card">
            <div className="form-group">
              <label htmlFor="nearbyCategory">Place Category</label>
              <select
                id="nearbyCategory"
                value={nearbyCategory}
                onChange={(event) => setNearbyCategory(event.target.value)}
              >
                <option value="all">All Places</option>
                <option value="temples">Temples</option>
                <option value="cafes">Cafes</option>
                <option value="restaurants">Restaurants</option>
                <option value="attractions">Attractions</option>
                <option value="shopping">Shopping</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="nearbyRadius">Search Radius</label>
              <select
                id="nearbyRadius"
                value={nearbyRadius}
                onChange={(event) => setNearbyRadius(event.target.value)}
              >
                <option value="1">Within 1 km</option>
                <option value="2">Within 2 km</option>
                <option value="3">Within 3 km</option>
                <option value="5">Within 5 km</option>
                <option value="10">Within 10 km</option>
              </select>
            </div>

            <button
              type="button"
              className="primary-button full-width"
              onClick={loadNearbyPlaces}
              disabled={
                loadingNearbyPlaces || (!drop.trim() && !pickup.trim())
              }
            >
              {loadingNearbyPlaces
                ? "Searching..."
                : "Search Nearby Places"}
            </button>
          </div>

          <div className="places-grid">
            {loadingNearbyPlaces ? (
              <p className="empty-state">Searching for nearby places...</p>
            ) : nearbyPlaces.length > 0 ? (
              nearbyPlaces.map((place, index) => (
                <article
                  className="place-card"
                  key={
                    place.id ??
                    `${place.name ?? place.place_name ?? "place"}-${index}`
                  }
                >
                  <span className="place-icon">📍</span>

                  <h3>
                    {place.name ??
                      place.place_name ??
                      place.title ??
                      `Place ${index + 1}`}
                  </h3>

                  <p>
                    {place.category ??
                      place.description ??
                      place.address ??
                      place.type ??
                      "Nearby place"}
                  </p>

                  {place.distance_km != null && (
                    <p>{place.distance_km} km away</p>
                  )}

                  {place.map_url && (
                    <a
                      href={place.map_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      View on map
                    </a>
                  )}
                </article>
              ))
            ) : (
              <div className="empty-state">
                Nearby places will appear here after you enter a pickup or
                destination and click Search Nearby Places.
              </div>
            )}
          </div>
        </section>
      </main>

      {/* FOOTER */}
      <footer className="footer">
        <h2>🚕 Krish Cab</h2>
        <p>Your journey, our priority.</p>
        <p>
          © {new Date().getFullYear()} Krish Cab. All rights reserved.
        </p>
      </footer>
    </div>
  );
}

export default App;
