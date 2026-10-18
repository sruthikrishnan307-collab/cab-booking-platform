
import { useCallback, useEffect, useState } from "react";
import "./App.css";

const API_URL = "https://cab-booking-platform-xp7l.onrender.com";

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
  const [bookingSearch, setBookingSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");

  // Loading states
  const [loadingFare, setLoadingFare] = useState(false);
  const [loadingBooking, setLoadingBooking] = useState(false);
  const [loadingBookings, setLoadingBookings] = useState(true);

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

      if (Array.isArray(detail)) {
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
      } else if (detail) {
        errorMessage = String(detail);
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

      setBookings(
        Array.isArray(data) ? data : data.bookings || []
      );
    } catch (err) {
      setError(`Could not load bookings: ${err.message}`);
    } finally {
      setLoadingBookings(false);
    }
  }, [apiRequest]);

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

    if (
      pickup.trim().toLowerCase() ===
      drop.trim().toLowerCase()
    ) {
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
      setError(`Fare estimation failed: ${err.message}`);
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

    if (
      pickup.trim().toLowerCase() ===
      drop.trim().toLowerCase()
    ) {
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
    if (
      typeof fareData === "number" ||
      typeof fareData === "string"
    ) {
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
      const data = await apiRequest(
        `/api/bookings/${bookingId}`
      );

      setTracking(data);
      setMessage("Booking details loaded.");
    } catch (err) {
      setError(`Could not find booking: ${err.message}`);
    }
  };

  // SEND SOS REQUEST
  const sendSOS = async (booking) => {
    const bookingId =
      booking?.booking_id ??
      booking?.id ??
      booking?.bookingId;

    if (!bookingId) {
      setError("Cannot send SOS: booking ID is missing.");
      return;
    }

    const confirmed = window.confirm(
      "Send an SOS request for this booking? " +
      "This records a request in Krish Cab but does NOT " +
      "contact police or emergency services."
    );

    if (!confirmed) return;

    setError("");
    setMessage("");

    try {
      const data = await apiRequest(
        `/api/bookings/${encodeURIComponent(bookingId)}/sos`,
        { method: "POST" }
      );

      setMessage(
        `SOS request recorded. Reference: ${data.sos_id}. ` +
        "No emergency services have been contacted."
      );
    } catch (err) {
      setError(`SOS request failed: ${err.message}`);
    }
  };

  // SHARE TRIP DETAILS
  const shareTrip = async (booking) => {
    const bookingId =
      booking?.booking_id ??
      booking?.id ??
      booking?.bookingId ??
      "Unavailable";

    const pickupLocation =
      booking?.pickup ??
      booking?.pickup_location ??
      "Unavailable";

    const destination =
      booking?.destination ??
      booking?.drop ??
      booking?.drop_location ??
      "Unavailable";

    const rideType =
      booking?.ride_type ??
      booking?.rideType ??
      booking?.cab_type ??
      booking?.vehicle_type ??
      "Unavailable";

    const status = booking?.status ?? "Unknown";

    const tripDetails = [
      "Krish Cab - Trip Details",
      `Booking ID: ${bookingId}`,
      `Pickup: ${pickupLocation}`,
      `Destination: ${destination}`,
      `Cab Type: ${rideType}`,
      `Status: ${status}`,
    ].join("\n");

    try {
      if (navigator.share) {
        await navigator.share({
          title: "My Krish Cab Trip",
          text: tripDetails,
        });

        setMessage("Trip details shared successfully.");
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(tripDetails);
        setMessage("Trip details copied to clipboard.");
      } else {
        window.prompt("Copy your trip details:", tripDetails);
      }
    } catch (err) {
      if (err.name !== "AbortError") {
        setError("Unable to share trip details. Please try again.");
      }
    }
  };


  // --------------------------------------------------
  // SEARCH AND FILTER BOOKINGS
  // --------------------------------------------------

  const filteredBookings = bookings.filter((booking) => {
    const bookingId = String(getBookingId(booking) ?? "");

    const pickupLocation =
      booking.pickup ?? booking.pickup_location ?? "";

    const destination =
      booking.drop ??
      booking.drop_location ??
      booking.destination ??
      "";

    const searchText = bookingSearch.trim().toLowerCase();

    const matchesSearch =
      bookingId.toLowerCase().includes(searchText) ||
      String(pickupLocation).toLowerCase().includes(searchText) ||
      String(destination).toLowerCase().includes(searchText);

    const status = String(
      booking.status ?? "Pending"
    ).toLowerCase();

    const matchesStatus =
      statusFilter === "All" ||
      (statusFilter === "Cancelled" &&
        status.includes("cancel")) ||
      (statusFilter === "Active" &&
        !status.includes("cancel") &&
        !status.includes("complete"));

    return matchesSearch && matchesStatus;
  });

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
        </nav>
      </header>

      <main>
        {/* HERO SECTION */}
        <section className="hero" id="home">
          <div className="hero-content">
            <p className="eyebrow">
              YOUR JOURNEY, OUR PRIORITY
            </p>

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
            <form
              className="booking-card"
              onSubmit={estimateFare}
            >
              <h3>Trip Details</h3>

              <div className="form-group">
                <label htmlFor="pickup">Pickup Location</label>
                <input
                  id="pickup"
                  type="text"
                  placeholder="Enter pickup location"
                  value={pickup}
                  onChange={(event) =>
                    setPickup(event.target.value)
                  }
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
                  onChange={(event) =>
                    setDrop(event.target.value)
                  }
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
                    onChange={(event) =>
                      setDistance(event.target.value)
                    }
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="duration">
                    Duration (minutes)
                  </label>
                  <input
                    id="duration"
                    type="number"
                    min="1"
                    step="any"
                    value={duration}
                    onChange={(event) =>
                      setDuration(event.target.value)
                    }
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="rideType">Choose Your Cab</label>
                <select
                  id="rideType"
                  value={rideType}
                  onChange={(event) =>
                    setRideType(event.target.value)
                  }
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
                {loadingFare
                  ? "Calculating Fare..."
                  : "Estimate Fare"}
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
                    {loadingBooking
                      ? "Booking..."
                      : "Confirm Booking"}
                  </button>
                </>
              ) : (
                <p className="muted">
                  Your estimated fare will appear here after you
                  submit your trip details.
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
                <strong>
                  {getBookingId(tracking) ?? "Not provided"}
                </strong>
              </div>

              <div>
                <span>Pickup</span>
                <strong>
                  {tracking.pickup ??
                    tracking.pickup_location ??
                    pickup}
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
            {/* SEARCH AND STATUS FILTERS */}
            <div className="booking-filters">
              <input
                type="search"
                placeholder="Search by booking ID or location..."
                value={bookingSearch}
                onChange={(event) =>
                  setBookingSearch(event.target.value)
                }
                aria-label="Search bookings"
              />

              <select
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value)
                }
                aria-label="Filter bookings by status"
              >
                <option value="All">All Bookings</option>
                <option value="Active">Active Rides</option>
                <option value="Cancelled">Cancelled Rides</option>
              </select>
            </div>

            {loadingBookings && bookings.length === 0 ? (
              <p className="empty-state">
                Loading your bookings...
              </p>
            ) : bookings.length === 0 ? (
              <p className="empty-state">
                No bookings available yet. Book your first ride!
              </p>
            ) : (
              <div className="bookings-list">
                {filteredBookings.map((booking, index) => {
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

                        <p>
                          Booking ID: {bookingId ?? "Not provided"}
                        </p>

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
                            onClick={() =>
                              trackBooking(bookingId)
                            }
                          >
                            View Details
                          </button>
                        )}

                        {bookingId != null && !isCancelled && (
                          <button
                            type="button"
                            className="danger-button"
                            onClick={() =>
                              cancelBooking(bookingId)
                            }
                          >
                            Cancel
                          </button>
                        )}

                            <button
                              type="button"
                              className="danger-button"
                              onClick={() => sendSOS(booking)}
                            >
                              🆘 SOS Emergency
                            </button>

                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => shareTrip(booking)}
                        >
                          📤 Share Trip
                        </button>

                      </div>
                    </article>
                  );
                })}

                {/* NO SEARCH RESULTS */}
                {filteredBookings.length === 0 && (
                  <p className="empty-state">
                    No bookings match your search or selected filter.
                  </p>
                )}
              </div>
            )}

            <button
              type="button"
              className="secondary-button refresh-button"
              onClick={loadBookings}
              disabled={loadingBookings}
            >
              {loadingBookings
                ? "Refreshing..."
                : "Refresh Bookings"}
            </button>
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
