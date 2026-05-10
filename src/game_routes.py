import sqlite3
import os
import re
from flask import Blueprint, request, jsonify
from datetime import datetime

game_bp = Blueprint('game', __name__)

DB_PATH = os.path.join(os.path.dirname(__file__), 'tmp', 'game.db')


def _get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_game_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = _get_db()
    conn.execute('''
        CREATE TABLE IF NOT EXISTS scores (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            name        TEXT    NOT NULL,
            score       INTEGER NOT NULL,
            proteins    INTEGER NOT NULL DEFAULT 0,
            complexes   INTEGER NOT NULL DEFAULT 0,
            created_at  TEXT    NOT NULL
        )
    ''')
    conn.commit()
    conn.close()


@game_bp.route('/api/game/leaderboard', methods=['GET'])
def leaderboard():
    try:
        limit = min(int(request.args.get('limit', 20)), 100)
        conn = _get_db()
        rows = conn.execute(
            '''SELECT name, score, proteins, complexes, created_at
               FROM scores ORDER BY score DESC LIMIT ?''',
            (limit,)
        ).fetchall()
        conn.close()
        return jsonify([dict(r) for r in rows])
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@game_bp.route('/api/game/score', methods=['POST'])
def submit_score():
    try:
        data = request.get_json(force=True) or {}

        raw_name = str(data.get('name') or '').strip()
        # Strip anything that's not alphanumeric, space, hyphen or underscore
        name = re.sub(r'[^\w\s\-]', '', raw_name, flags=re.UNICODE)[:24].strip()
        if not name:
            return jsonify({'error': 'Name is required'}), 400

        score    = max(0, int(data.get('score')    or 0))
        proteins = max(0, int(data.get('proteins') or 0))
        complexes= max(0, int(data.get('complexes')or 0))

        conn = _get_db()
        conn.execute(
            'INSERT INTO scores (name, score, proteins, complexes, created_at) VALUES (?, ?, ?, ?, ?)',
            (name, score, proteins, complexes, datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ'))
        )
        conn.commit()

        rank = conn.execute(
            'SELECT COUNT(*) FROM scores WHERE score > ?', (score,)
        ).fetchone()[0] + 1
        total = conn.execute('SELECT COUNT(*) FROM scores').fetchone()[0]
        conn.close()

        return jsonify({'ok': True, 'rank': rank, 'total': total, 'name': name})
    except Exception as e:
        return jsonify({'error': str(e)}), 500
