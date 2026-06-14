import re
import numpy as np
import pandas as pd
from google_play_scraper import Sort, reviews
from sklearn.model_selection import train_test_split
import tensorflow as tf
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import Embedding, LSTM, Dense, Bidirectional, Dropout, SpatialDropout1D, Input
from tensorflow.keras.preprocessing.text import Tokenizer
from tensorflow.keras.preprocessing.sequence import pad_sequences
from tensorflow.keras.callbacks import EarlyStopping

# ====================================================
# 1. SCRAPING DATA PLAY STORE (DITINGKATKAN KE 1500 DATA)
# ====================================================
print("1. Mengambil data ulasan terbaru dari Google Play Store...")
app_id = 'com.pegadaiandigital'

scrapped_reviews, _ = reviews(
    app_id, lang='id', country='id', sort=Sort.NEWEST, count=1500 
)
df_raw = pd.DataFrame(scrapped_reviews)

if df_raw.empty:
    print("❌ Gagal! Data dari Play Store kosong.")
    exit()

df = df_raw[['content', 'score', 'at']].copy()
df.columns = ['Tweet', 'Rating', 'Tanggal']

# Filter Khusus Tahun 2026 & Buang Rating Netral (3)
df['Tanggal'] = pd.to_datetime(df['Tanggal'])
df = df[(df['Tanggal'].dt.year == 2026) & (df['Rating'] != 3)].copy()
df['Tanggal'] = df['Tanggal'].dt.date

if df.empty:
    print("⚠️ Tidak ada data ulasan tahun 2026 yang memenuhi syarat biner.")
    exit()

# Labeling Ground Truth untuk Training
df['Label_Asli'] = df['Rating'].apply(lambda x: 1 if x >= 4 else 0)

print(f"✓ Total data tahun 2026 yang siap diproses: {len(df)} baris.")

# ====================================================
# 2. TOKENIZATION & PADDING
# ====================================================
print("2. Menyiapkan tokenisasi teks ulasan...")
vocab_size = 5000
max_length = 80 # Dipersingkat sedikit agar pemrosesan BiLSTM lebih padat

tokenizer = Tokenizer(num_words=vocab_size, oov_token="<OOV>")
tokenizer.fit_on_texts(df['Tweet'].astype(str))

# Siapkan data untuk split training
X_train_raw, X_test_raw, y_train, y_test = train_test_split(
    df['Tweet'].astype(str), df['Label_Asli'], test_size=0.2, random_state=42, stratify=df['Label_Asli']
)

X_train_pad = pad_sequences(tokenizer.texts_to_sequences(X_train_raw), maxlen=max_length, padding='post', truncating='post')
X_test_pad = pad_sequences(tokenizer.texts_to_sequences(X_test_raw), maxlen=max_length, padding='post', truncating='post')

# ====================================================
# 3. ARSITEKTUR BiLSTM UPGRADED (ANTI-OVERFITTING)
# ====================================================
print("3. Merakit model Deep Learning BiLSTM yang dioptimasi...")
embedding_dim = 64

model = Sequential([
    Input(shape=(max_length,)),
    Embedding(input_dim=vocab_size, output_dim=embedding_dim),
    SpatialDropout1D(0.3), # Mematikan kluster matriks kata agar model lebih tangguh
    Bidirectional(LSTM(64, return_sequences=False)),
    Dropout(0.4),
    Dense(32, activation='relu'),
    Dense(1, activation='sigmoid')
])

model.compile(optimizer=tf.keras.optimizers.Adam(learning_rate=0.001), 
              loss='binary_crossentropy', 
              metrics=['accuracy'])

# Callback untuk menghentikan training secara cerdas saat model sudah mencapai puncak performa
early_stop = EarlyStopping(monitor='val_loss', patience=3, restore_best_weights=True)

print("\n4. Memulai pelatihan model...")
model.fit(
    X_train_pad, np.array(y_train),
    epochs=15, # Naik ke 15 karena didampingi EarlyStopping
    batch_size=32,
    validation_data=(X_test_pad, np.array(y_test)),
    callbacks=[early_stop],
    verbose=1
)

# ====================================================
# 4. PREDIKSI MASSAL & EKSTRAKSI ASPEK BISNIS
# ====================================================
print("\n5. Melakukan prediksi sentimen murni pada seluruh data ulasan...")
X_all_pad = pad_sequences(tokenizer.texts_to_sequences(df['Tweet'].astype(str)), maxlen=max_length, padding='post', truncating='post')

# Prediksi probabilitas angka biner, lalu konversi menjadi teks label pesanan Streamlit
prob_predictions = model.predict(X_all_pad)
df['Sentimen'] = ['Positif' if p >= 0.5 else 'Negatif' for p in prob_predictions]

# Aturan Pengelompokan Aspek Bisnis berbasis kata kunci lokal
def tentukan_aspek(text):
    text = str(text).lower()
    if any(x in text for x in ['aplikasi', 'login', 'error', 'update', 'buka', 'masuk', 'bug', 'blank', 'loading', 'keluar']): 
        return 'Aplikasi Digital (Bug/UI)'
    elif any(x in text for x in ['admin', 'biaya', 'potong', 'mahal', 'pajak', 'saldo', 'tf', 'transfer']): 
        return 'Biaya & Administrasi'
    elif any(x in text for x in ['buyback', 'jual', 'harga', 'emas', 'batangan', 'turun', 'naik', 'gadai', 'tabungan']): 
        return 'Harga Emas & Gadai'
    elif any(x in text for x in ['layan', 'cs', 'bantu', 'sales', 'call', 'respon', 'lambat', 'kantor', 'hubungi', 'petugas']): 
        return 'Customer Service / Pelayanan'
    else: 
        return 'Fitur Produk / Transaksi'

df['Aspek_Bisnis'] = df['Tweet'].apply(tentukan_aspek)

# ====================================================
# 5. GENERATE DATA AKHIR (.CSV)
# ====================================================
df_hasil = df[['Tanggal', 'Tweet', 'Sentimen', 'Aspek_Bisnis']]
df_hasil.to_csv("siap_dashboard.csv", index=False)

print("\n🚀 [SUKSES TOTAL] File 'siap_dashboard.csv' berhasil digenerate menggunakan Deep Learning BiLSTM!")
print(f"Silakan langsung jalankan 'streamlit run app.py' untuk melihat visualisasinya.")