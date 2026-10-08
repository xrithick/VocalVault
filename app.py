import os
from datetime import datetime, timedelta
from functools import wraps
import bcrypt
from dotenv import load_dotenv
from flask import (
    Flask,
    flash,
    redirect,
    render_template,
    request,
    session,
    url_for,
)
from supabase import Client, create_client

# Load environment variables from .env
load_dotenv()

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "vocalvault-default-secret-key-321")

# -------------------------------------------------------------
# Supabase Client Helper
# -------------------------------------------------------------
SUPABASE_URL = os.environ.get("SUPABASE_URL", "").strip()
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "").strip()


def get_supabase() -> Client | None:
    """Returns the initialized Supabase client, or None if credentials are not configured."""
    if (
        not SUPABASE_URL
        or not SUPABASE_KEY
        or "your-supabase" in SUPABASE_URL
        or "your-supabase" in SUPABASE_KEY
        or not SUPABASE_URL.startswith("http")
    ):
        return None
    try:
        return create_client(SUPABASE_URL, SUPABASE_KEY)
    except Exception as e:
        print(f"[Supabase Init Error] {e}")
        return None


def is_configured() -> bool:
    """Checks if Supabase credentials are configured."""
    return get_supabase() is not None


# -------------------------------------------------------------
# Authentication Decorator
# -------------------------------------------------------------
def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if "user_id" not in session:
            flash("Please log in to access this page.", "warning")
            return redirect(url_for("login"))
        return f(*args, **kwargs)

    return decorated_function


# -------------------------------------------------------------
# Context Processor (makes variables available in all templates)
# -------------------------------------------------------------
@app.context_processor
def inject_global_vars():
    return {
        "current_user_id": session.get("user_id"),
        "current_user_name": session.get("user_name"),
        "current_user_email": session.get("user_email"),
        "is_configured": is_configured(),
        "today_date": datetime.now().strftime("%Y-%m-%d"),
    }


# -------------------------------------------------------------
# Routes
# -------------------------------------------------------------


@app.route("/")
def index():
    """Home / Landing page"""
    if "user_id" in session:
        return redirect(url_for("dashboard"))
    return render_template("index.html")


@app.route("/register", methods=["GET", "POST"])
def register():
    """User registration"""
    if "user_id" in session:
        return redirect(url_for("dashboard"))

    if request.method == "POST":
        name = request.form.get("name", "").strip()
        email = request.form.get("email", "").strip().lower()
        password = request.form.get("password", "")

        if not name or not email or not password:
            flash("Please fill in all fields.", "danger")
            return render_template("register.html")

        if len(password) < 6:
            flash("Password must be at least 6 characters long.", "danger")
            return render_template("register.html")

        supabase = get_supabase()
        if not supabase:
            flash(
                "Supabase is not configured yet! Please update your .env file with your Supabase credentials.",
                "danger",
            )
            return render_template("register.html")

        try:
            # Check if email is already registered
            existing = (
                supabase.table("users").select("id").eq("email", email).execute()
            )
            if existing.data and len(existing.data) > 0:
                flash(
                    "An account with this email already exists. Please log in.",
                    "warning",
                )
                return redirect(url_for("login"))

            # Hash password using bcrypt
            salt = bcrypt.gensalt()
            password_hash = bcrypt.hashpw(
                password.encode("utf-8"), salt
            ).decode("utf-8")

            # Insert new user
            supabase.table("users").insert(
                {
                    "name": name,
                    "email": email,
                    "password_hash": password_hash,
                }
            ).execute()

            flash(
                "Registration successful! Please log in with your credentials.",
                "success",
            )
            return redirect(url_for("login"))

        except Exception as e:
            flash(f"Error during registration: {str(e)}", "danger")
            return render_template("register.html")

    return render_template("register.html")


@app.route("/login", methods=["GET", "POST"])
def login():
    """User login"""
    if "user_id" in session:
        return redirect(url_for("dashboard"))

    if request.method == "POST":
        email = request.form.get("email", "").strip().lower()
        password = request.form.get("password", "")

        if not email or not password:
            flash("Please enter both email and password.", "danger")
            return render_template("login.html")

        supabase = get_supabase()
        if not supabase:
            flash(
                "Supabase is not configured yet! Please update your .env file with your Supabase credentials.",
                "danger",
            )
            return render_template("login.html")

        try:
            # Look up user by email
            res = (
                supabase.table("users")
                .select("id, name, email, password_hash")
                .eq("email", email)
                .execute()
            )

            if not res.data or len(res.data) == 0:
                flash("Invalid email or password.", "danger")
                return render_template("login.html")

            user = res.data[0]
            stored_hash = user.get("password_hash", "")

            # Verify password using bcrypt
            if bcrypt.checkpw(
                password.encode("utf-8"), stored_hash.encode("utf-8")
            ):
                # Password matches -> store user info in session
                session["user_id"] = user["id"]
                session["user_name"] = user["name"]
                session["user_email"] = user["email"]
                flash(f"Welcome back, {user['name']}!", "success")
                return redirect(url_for("dashboard"))
            else:
                flash("Invalid email or password.", "danger")
                return render_template("login.html")

        except Exception as e:
            flash(f"Error during login: {str(e)}", "danger")
            return render_template("login.html")

    return render_template("login.html")


@app.route("/logout")
def logout():
    """Clear session and log out"""
    session.clear()
    flash("You have been logged out successfully.", "info")
    return redirect(url_for("login"))


@app.route("/dashboard")
@login_required
def dashboard():
    """Main dashboard with statistics and quick actions"""
    user_id = session["user_id"]
    supabase = get_supabase()

    total_songs = 0
    total_sessions = 0
    total_minutes = 0
    avg_rating = 0.0
    recent_practices = []

    if supabase:
        try:
            # Fetch user's songs
            songs_res = (
                supabase.table("songs")
                .select("id, song_name, artist")
                .eq("user_id", user_id)
                .execute()
            )
            songs = songs_res.data or []
            total_songs = len(songs)
            songs_map = {s["id"]: s for s in songs}

            # Fetch user's practice logs
            practices_res = (
                supabase.table("practice")
                .select("*")
                .eq("user_id", user_id)
                .order("date", desc=True)
                .order("id", desc=True)
                .execute()
            )
            practices = practices_res.data or []
            total_sessions = len(practices)

            if total_sessions > 0:
                total_minutes = sum(p.get("minutes", 0) for p in practices)
                total_ratings = sum(p.get("rating", 0) for p in practices)
                avg_rating = round(total_ratings / total_sessions, 1)

            # Map song names for recent 5 sessions
            for p in practices[:5]:
                song_info = songs_map.get(p.get("song_id"), {})
                recent_practices.append(
                    {
                        **p,
                        "song_name": song_info.get(
                            "song_name", "Unknown Song"
                        ),
                        "artist": song_info.get("artist", "Unknown Artist"),
                    }
                )

        except Exception as e:
            flash(f"Database error: {str(e)}", "danger")

    return render_template(
        "dashboard.html",
        total_songs=total_songs,
        total_sessions=total_sessions,
        total_minutes=total_minutes,
        avg_rating=avg_rating,
        recent_practices=recent_practices,
    )


@app.route("/songs", methods=["GET", "POST"])
@login_required
def songs():
    """List all songs and add new song"""
    user_id = session["user_id"]
    supabase = get_supabase()

    if request.method == "POST":
        song_name = request.form.get("song_name", "").strip()
        artist = request.form.get("artist", "").strip()
        language = request.form.get("language", "").strip()
        difficulty = request.form.get("difficulty", "Medium").strip()

        if not song_name or not artist or not language:
            flash("Please fill in song name, artist, and language.", "danger")
            return redirect(url_for("songs"))

        if difficulty not in ["Easy", "Medium", "Hard"]:
            difficulty = "Medium"

        if not supabase:
            flash("Database not configured.", "danger")
            return redirect(url_for("songs"))

        try:
            supabase.table("songs").insert(
                {
                    "user_id": user_id,
                    "song_name": song_name,
                    "artist": artist,
                    "language": language,
                    "difficulty": difficulty,
                }
            ).execute()
            flash(f'Song "{song_name}" added successfully!', "success")
        except Exception as e:
            flash(f"Error adding song: {str(e)}", "danger")

        return redirect(url_for("songs"))

    # GET: List songs
    user_songs = []
    if supabase:
        try:
            res = (
                supabase.table("songs")
                .select("*")
                .eq("user_id", user_id)
                .order("id", desc=True)
                .execute()
            )
            user_songs = res.data or []
        except Exception as e:
            flash(f"Error loading songs: {str(e)}", "danger")

    return render_template("songs.html", songs=user_songs)


@app.route("/songs/edit/<int:song_id>", methods=["POST"])
@login_required
def edit_song(song_id):
    """Edit an existing song"""
    user_id = session["user_id"]
    supabase = get_supabase()

    song_name = request.form.get("song_name", "").strip()
    artist = request.form.get("artist", "").strip()
    language = request.form.get("language", "").strip()
    difficulty = request.form.get("difficulty", "Medium").strip()

    if not song_name or not artist or not language:
        flash("Please fill in all fields.", "danger")
        return redirect(url_for("songs"))

    if supabase:
        try:
            supabase.table("songs").update(
                {
                    "song_name": song_name,
                    "artist": artist,
                    "language": language,
                    "difficulty": difficulty,
                }
            ).eq("id", song_id).eq("user_id", user_id).execute()
            flash("Song updated successfully!", "success")
        except Exception as e:
            flash(f"Error updating song: {str(e)}", "danger")

    return redirect(url_for("songs"))


@app.route("/songs/delete/<int:song_id>", methods=["POST"])
@login_required
def delete_song(song_id):
    """Delete a song and its associated practice records"""
    user_id = session["user_id"]
    supabase = get_supabase()

    if supabase:
        try:
            # First delete related practice entries (to be safe if CASCADE is not set)
            supabase.table("practice").delete().eq("song_id", song_id).eq(
                "user_id", user_id
            ).execute()
            # Then delete the song
            supabase.table("songs").delete().eq("id", song_id).eq(
                "user_id", user_id
            ).execute()
            flash("Song deleted successfully.", "info")
        except Exception as e:
            flash(f"Error deleting song: {str(e)}", "danger")

    return redirect(url_for("songs"))


@app.route("/practice", methods=["GET", "POST"])
@login_required
def practice():
    """Log practice session and view practice history"""
    user_id = session["user_id"]
    supabase = get_supabase()

    selected_song_id = request.args.get("song_id", type=int)

    if request.method == "POST":
        song_id = request.form.get("song_id", type=int)
        date = (
            request.form.get("date") or datetime.now().strftime("%Y-%m-%d")
        ).strip()
        minutes = request.form.get("minutes", type=int)
        rating = request.form.get("rating", type=int)
        notes = request.form.get("notes", "").strip()

        if not song_id or not minutes or not rating:
            flash("Please choose a song, duration, and rating.", "danger")
            return redirect(url_for("practice", song_id=selected_song_id))

        if minutes <= 0:
            flash("Practice minutes must be greater than 0.", "danger")
            return redirect(url_for("practice", song_id=selected_song_id))

        if rating < 1 or rating > 5:
            flash("Rating must be between 1 and 5.", "danger")
            return redirect(url_for("practice", song_id=selected_song_id))

        if not supabase:
            flash("Database not configured.", "danger")
            return redirect(url_for("practice"))

        try:
            supabase.table("practice").insert(
                {
                    "user_id": user_id,
                    "song_id": song_id,
                    "date": date,
                    "minutes": minutes,
                    "rating": rating,
                    "notes": notes,
                }
            ).execute()
            flash("Practice session logged successfully! Keep it up!", "success")
        except Exception as e:
            flash(f"Error logging practice: {str(e)}", "danger")

        return redirect(url_for("practice"))

    # GET: Load songs for dropdown and practice history
    user_songs = []
    practice_history = []

    if supabase:
        try:
            # Get songs for dropdown
            songs_res = (
                supabase.table("songs")
                .select("id, song_name, artist, difficulty")
                .eq("user_id", user_id)
                .order("song_name")
                .execute()
            )
            user_songs = songs_res.data or []
            songs_map = {s["id"]: s for s in user_songs}

            # Get practice logs
            logs_res = (
                supabase.table("practice")
                .select("*")
                .eq("user_id", user_id)
                .order("date", desc=True)
                .order("id", desc=True)
                .execute()
            )
            logs = logs_res.data or []

            for log in logs:
                song_info = songs_map.get(log.get("song_id"), {})
                practice_history.append(
                    {
                        **log,
                        "song_name": song_info.get(
                            "song_name", "Unknown Song"
                        ),
                        "artist": song_info.get("artist", "Unknown Artist"),
                    }
                )

        except Exception as e:
            flash(f"Error loading practice logs: {str(e)}", "danger")

    return render_template(
        "practice.html",
        songs=user_songs,
        practice_history=practice_history,
        selected_song_id=selected_song_id,
    )


@app.route("/practice/delete/<int:practice_id>", methods=["POST"])
@login_required
def delete_practice(practice_id):
    """Delete a practice session log"""
    user_id = session["user_id"]
    supabase = get_supabase()

    if supabase:
        try:
            supabase.table("practice").delete().eq("id", practice_id).eq(
                "user_id", user_id
            ).execute()
            flash("Practice log deleted successfully.", "info")
        except Exception as e:
            flash(f"Error deleting practice log: {str(e)}", "danger")

    return redirect(url_for("practice"))


@app.route("/progress")
@login_required
def progress():
    """Statistics and practice progress chart"""
    user_id = session["user_id"]
    supabase = get_supabase()

    total_minutes = 0
    total_sessions = 0
    avg_rating = 0.0
    most_practiced_song = None

    # Chart data: Last 7 days
    today = datetime.now().date()
    date_labels = []
    minutes_per_day = {}

    for i in range(6, -1, -1):
        day = today - timedelta(days=i)
        day_str = day.strftime("%Y-%m-%d")
        display_label = day.strftime("%b %d")  # e.g. "Oct 07"
        date_labels.append(display_label)
        minutes_per_day[day_str] = 0

    if supabase:
        try:
            # Load user's songs
            songs_res = (
                supabase.table("songs")
                .select("id, song_name, artist")
                .eq("user_id", user_id)
                .execute()
            )
            songs = songs_res.data or []
            songs_map = {s["id"]: s for s in songs}

            # Load user's practice logs
            practice_res = (
                supabase.table("practice")
                .select("*")
                .eq("user_id", user_id)
                .execute()
            )
            practices = practice_res.data or []

            total_sessions = len(practices)
            if total_sessions > 0:
                total_minutes = sum(p.get("minutes", 0) for p in practices)
                total_rating = sum(p.get("rating", 0) for p in practices)
                avg_rating = round(total_rating / total_sessions, 1)

                # Find most practiced song (by total minutes)
                song_minutes = {}
                song_sessions = {}
                for p in practices:
                    s_id = p.get("song_id")
                    m = p.get("minutes", 0)
                    song_minutes[s_id] = song_minutes.get(s_id, 0) + m
                    song_sessions[s_id] = song_sessions.get(s_id, 0) + 1

                    # Chart aggregation for matching dates
                    p_date = str(p.get("date", ""))[:10]
                    if p_date in minutes_per_day:
                        minutes_per_day[p_date] += m

                if song_minutes:
                    top_song_id = max(song_minutes, key=song_minutes.get)
                    top_song_info = songs_map.get(top_song_id, {})
                    most_practiced_song = {
                        "name": top_song_info.get("song_name", "Unknown Song"),
                        "artist": top_song_info.get(
                            "artist", "Unknown Artist"
                        ),
                        "total_minutes": song_minutes[top_song_id],
                        "total_sessions": song_sessions[top_song_id],
                    }

        except Exception as e:
            flash(f"Error loading progress statistics: {str(e)}", "danger")

    # Chart datasets ordered according to date_labels
    chart_data = list(minutes_per_day.values())

    return render_template(
        "progress.html",
        total_minutes=total_minutes,
        total_sessions=total_sessions,
        avg_rating=avg_rating,
        most_practiced_song=most_practiced_song,
        chart_labels=date_labels,
        chart_data=chart_data,
    )


if __name__ == "__main__":
    # Run development server
    port = int(os.environ.get("PORT", 5000))
    app.run(host="127.0.0.1", port=port, debug=True)
