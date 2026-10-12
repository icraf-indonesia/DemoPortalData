# Rancang Bangun Full-Canvas Layout Portal Data Epistem

Dokumen ini mendokumentasikan keputusan arsitektural untuk implementasi tata letak layar penuh (*full-canvas layout*) pada Portal Data Epistem.

## 1. Perbandingan Desain Sumber Kebenaran (*Single Source of Truth*)

Dua opsi arsitektural dievaluasi sebelum melakukan perubahan kode:

### Opsi A: Kontroller Tata Letak Terpisah (*Standalone Layout Controller with Local Registry*)
* **Deskripsi:** Membuat kelas `LayoutController` mandiri yang mengelola registri visibilitas panel kiri, kanan, dan laci tabel observasi secara terisolasi.
* **Kelemahan:** Memecah status visibilitas tabel atribut. `WorkspaceState` sudah memiliki `isTableCollapsed` yang dipantau oleh `AttributeTableView` dan diuji oleh *test suite*. Jika kontroler terpisah menyimpan status sendiri, timbul *split-brain* (dua sumber kebenaran) yang berisiko tidak sinkron saat terjadi *reset* atau transisi dataset.

### Opsi B: Penambahan Status Sisi Panel ke `WorkspaceState` & Sinkronisasi UI via Kontroller Tata Letak (Dipilih)
* **Deskripsi:** Memperluas `WorkspaceState` dengan `isLeftCollapsed` dan `isRightCollapsed` bersanding dengan `isTableCollapsed`, didukung oleh penyimpanan preferensi lokal `storage.js` (`portal_epistem_workspace_prefs_v1`). Kontroller UI (`LayoutController`) bertindak sebagai pelaksana interaksi DOM, aksesibilitas keyboard, dan fokus.
* **Keunggulan:**
  1. **Satu Sumber Kebenaran:** Setiap dimensi visibilitas (`isLeftCollapsed`, `isRightCollapsed`, `isTableCollapsed`) memiliki tepat satu pemilik status reaktif.
  2. **Koherensi Menyeluruh:** Status tabel atribut tetap utuh dan selaras dengan *lifecycle* aplikasi.
  3. **Pemisahan Data & Preferensi:** Penyimpanan preferensi visibilitas terpisah sepenuhnya dari data proyek (`portal_epistem_project_state_v1`). Nilai dari `localStorage` divalidasi ketat (hanya tipe *boolean* yang diizinkan).
  4. **Kondisi Awal Profil Bersih (*Fresh Profile*):** Panel kiri terbuka (`isLeftCollapsed = false`), panel kanan terbuka (`isRightCollapsed = false`), dan laci tabel observasi tertutup (`isTableCollapsed = true`).

---

## 2. Struktur Tata Letak Full-Canvas

1. **Kanvas Peta Penuh (*Full-Bleed Canvas*):**
   * Kontainer `#map-container` berposisi absolut (`inset: 0`) di dalam `.workspace-layout`, mengisi 100% lebar dan tinggi ruang kerja di belakang seluruh panel melayang (*floating panels*) dan laci (*drawer*).
   * Lebar peta selalu sama dengan lebar ruang kerja, baik saat panel melayang terbuka maupun saat diciutkan.

2. **Panel Melayang Sisi Kiri & Kanan (*Floating Cards*):**
   * Panel kiri (`#panel-left-container`) menampung Skema Klasifikasi.
   * Panel kanan (`#panel-right-container`) menampung Katalog Data.
   * Setiap panel memiliki bilah atas (*topbar*) persisten yang menaungi tombol ciutkan (`#btn-collapse-left` / `#btn-collapse-right`) di luar kontainer konten yang dirender ulang oleh `ClassificationView` dan `CatalogueView`.
   * Tombol buka kembali berlabel bahasa Indonesia (`#btn-reopen-left` "Skema Klasifikasi" dan `#btn-reopen-right` "Katalog Data") muncul di posisi semula saat panel terkait diciutkan.

3. **Laci Bawah Tabel Atribut (*Overlay Drawer*):**
   * `#panel-bottom` bertindak sebagai laci hamparan (*overlay drawer*) di bagian bawah kanvas dengan `z-index: 800`.
   * Saat diciutkan (*default* profil baru), hanya bilah tajuk (*header bar*) yang terlihat setinggi ~38px.
   * Saat dibuka, laci melebar ke atas menampilkan tabel observasi tanpa menimpa panel samping (panel samping menyesuaikan batas bawah secara mulus ke atas laci).

4. **Pencegahan Pergeseran Peta (*Map Center & Zoom Preservation*):**
   * Menghapus pemanggilan `fitToContent()` pada aksi yang hanya mengubah visibilitas (ciutkan/buka panel atau tabel).
   * Pemanggilan `map.invalidateSize({ pan: false })` menjaga koordinat pusat dan level *zoom* peta secara konsisten.
   * `ResizeObserver` pada kontainer peta menangani perubahan dimensi wadah secara otomatis.

5. **Aksesibilitas & Penanganan Fokus:**
   * Atribut ARIA tersemat: `aria-expanded`, `aria-controls`, `aria-label`.
   * Panel yang tertutup diberi atribut `inert` dan `visibility: hidden` sehingga konten tersembunyi tidak dapat dijangkau oleh tombol `Tab`.
   * Menutup panel secara otomatis mengalihkan fokus keyboard ke tombol buka kembali (*reopen button*).
   * Membuka panel secara otomatis mengalihkan fokus kembali ke tombol ciutkan.

6. **Isolasi Interaksi Peta:**
   * Seluruh panel dan tombol kontrol dilengkapi pencegah perambatan *event* Leaflet (`L.DomEvent.disableClickPropagation` dan `disableScrollPropagation`), memastikan interaksi gulir atau klik di panel tidak memicu *zoom* atau penambahan titik *sampling* di peta.
