from flask import Flask, jsonify
from google import genai
import os
import json
from datetime import datetime

app = Flask(__name__)

# المفتاح محفوظ في متغير البيئة
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
client = genai.Client(api_key=GEMINI_API_KEY)

# مجلد حفظ الكتب
BOOKS_DIR = "books"
os.makedirs(BOOKS_DIR, exist_ok=True)

def generate_child_book(title=None):
    prompt = f"""
    اكتب كتاب للأطفال بالعربية، 5 فصول، كل فصل فقرة قصيرة مع عنوان.
    اجعل الأسلوب ممتع وبسيط.
    """
    if title:
        prompt = f"اكتب كتاب للأطفال بعنوان '{title}'، 5 فصول، كل فصل فقرة قصيرة مع عنوان."

    model = client.models.get("gemini-2.5-flash")
    response = model.generate_content(prompt)
    text = response.text.strip()

    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    filename = f"{BOOKS_DIR}/book_{timestamp}.json"
    book = {"title": title or f"كتاب أطفال {timestamp}", "content": text}

    with open(filename, "w", encoding="utf-8") as f:
        json.dump(book, f, ensure_ascii=False, indent=2)

    return book

@app.route("/books/latest")
def latest_book():
    files = sorted(os.listdir(BOOKS_DIR), reverse=True)
    if not files:
        book = generate_child_book()
    else:
        with open(f"{BOOKS_DIR}/{files[0]}", encoding="utf-8") as f:
            book = json.load(f)
    return jsonify(book)

@app.route("/books/generate")
def generate_new_book():
    book = generate_child_book()
    return jsonify(book)

if __name__ == "__main__":
    app.run(debug=True)