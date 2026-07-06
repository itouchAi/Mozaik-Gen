// Mozaik Sanat Stüdyosu - Vektör Şablonları Verisi
// Her şablon, Path2D tarafından çizilebilen SVG yollarına (paths) sahiptir.

export interface MosaicRegion {
  id: string;
  name: string; // Türkçe açıklama
  path: string; // SVG Path verisi
  defaultColor: string; // Varsayılan renk (Hex)
}

export interface MosaicTemplate {
  id: string;
  name: string;
  description: string;
  width: number;
  height: number;
  strokeWidth: number;
  backgroundColor: string;
  regions: MosaicRegion[];
}

export const templates: MosaicTemplate[] = [
  {
    id: "unicorn",
    name: "Sihirli Tek Boynuzlu At",
    description: "Gökyüzü, bulutlar ve çimler arasında duran asil tek boynuzlu at şablonu (1. görseldeki çizimden esinlenilmiştir).",
    width: 500,
    height: 500,
    strokeWidth: 3,
    backgroundColor: "#0d0e15", // Koyu lacivert arka plan
    regions: [
      {
        id: "sky",
        name: "Arka Plan Gökyüzü",
        path: "M 0,0 L 500,0 L 500,500 L 0,500 Z",
        defaultColor: "#1a1c2e",
      },
      {
        id: "cloud_large",
        name: "Büyük Bulut (Sağ Üst)",
        path: "M 270,90 C 270,70 300,60 320,70 C 330,55 365,55 375,70 C 390,60 410,75 410,95 C 410,110 395,120 375,120 L 290,120 C 275,120 270,110 270,90 Z",
        defaultColor: "#a3b2cc",
      },
      {
        id: "cloud_left",
        name: "Küçük Bulut (Sol)",
        path: "M 45,150 C 45,140 60,130 70,135 C 75,125 95,125 100,135 C 110,130 120,140 120,150 C 120,160 110,165 100,165 L 60,165 C 50,165 45,160 45,150 Z",
        defaultColor: "#8fa3c2",
      },
      {
        id: "cloud_right",
        name: "Küçük Bulut (Sağ)",
        path: "M 380,180 C 380,170 395,160 405,165 C 410,155 430,155 435,165 C 445,160 455,170 455,180 C 455,190 445,195 435,195 L 400,195 C 390,195 380,190 380,180 Z",
        defaultColor: "#8fa3c2",
      },
      {
        id: "ground",
        name: "Yer / Çimenlik Alan",
        path: "M 20,400 Q 150,370 250,390 T 480,400 L 480,480 L 20,480 Z",
        defaultColor: "#22593b",
      },
      {
        id: "body",
        name: "Gövde ve Bacaklar",
        path: "M 155,245 C 165,240 215,220 250,225 C 290,230 320,270 320,315 C 320,345 305,385 295,395 L 285,395 L 290,340 C 295,300 280,285 260,285 C 240,285 242,320 240,395 L 225,395 L 235,310 C 238,285 220,280 210,280 C 200,280 195,295 190,380 L 175,380 L 180,310 C 182,280 170,275 160,275 C 150,275 145,285 142,370 L 128,370 L 138,295 C 140,270 145,250 155,245 Z",
        defaultColor: "#e6e8f2",
      },
      {
        id: "neck_head",
        name: "Boyun ve Baş",
        path: "M 155,245 C 150,230 140,190 140,165 C 140,135 155,115 170,115 C 185,115 200,125 210,150 C 220,175 215,210 200,235 Z",
        defaultColor: "#f0f2fa",
      },
      {
        id: "muzzle",
        name: "Ağız ve Burun Bölgesi",
        path: "M 140,165 C 130,165 120,155 120,145 C 120,135 130,130 145,130 C 150,130 155,135 155,145 Z",
        defaultColor: "#ffd6e0",
      },
      {
        id: "horn",
        name: "Altın Boynuz",
        path: "M 150,115 L 145,50 L 160,110 Z",
        defaultColor: "#ffd700",
      },
      {
        id: "mane",
        name: "Atın Yelesi",
        path: "M 185,115 C 195,100 215,100 220,115 C 225,100 238,105 240,125 C 242,145 230,175 230,205 C 230,235 220,245 210,245 C 215,225 220,185 210,160 Z",
        defaultColor: "#ff9ebe",
      },
      {
        id: "tail",
        name: "Atın Kuyruğu",
        path: "M 315,305 C 340,300 380,310 395,340 C 410,370 395,410 365,410 C 350,410 340,390 340,375 C 340,360 355,345 355,335 C 355,325 330,325 318,320 Z",
        defaultColor: "#ff8da1",
      },
      {
        id: "hooves",
        name: "Nallar",
        path: "M 128,370 L 142,370 L 140,385 L 126,385 Z M 175,380 L 190,380 L 188,395 L 173,395 Z M 225,395 L 240,395 L 238,410 L 223,410 Z M 285,395 L 300,395 L 298,410 L 283,410 Z",
        defaultColor: "#cca43b",
      },
      {
        id: "plants_left",
        name: "Yapraklar ve Çalılar (Sol)",
        path: "M 30,350 C 40,310 70,300 80,330 C 90,300 110,310 115,340 C 120,330 140,340 135,370 C 130,390 100,410 60,410 C 30,410 20,380 30,350 Z",
        defaultColor: "#1d7a44",
      },
      {
        id: "plants_right",
        name: "Sarmaşık / Yapraklar (Sağ)",
        path: "M 410,390 C 405,370 415,350 430,350 C 445,350 455,370 455,390 Z M 445,390 C 445,375 460,365 470,380 C 480,365 490,375 490,395 Z",
        defaultColor: "#1d7a44",
      },
    ],
  },
  {
    id: "bear",
    name: "Sevimli Mozaik Ayı",
    description: "Balık tutan ve oturan sevimli ayı şablonu (2. görseldeki kompozisyondan esinlenilmiştir).",
    width: 500,
    height: 500,
    strokeWidth: 3,
    backgroundColor: "#ffffff", // Beyaz arka plan
    regions: [
      {
        id: "sky",
        name: "Arka Plan Gökyüzü",
        path: "M 20,20 L 480,20 L 480,480 L 20,480 Z",
        defaultColor: "#2a4d69",
      },
      {
        id: "mountain_left",
        name: "Sol Dağ",
        path: "M 20,350 L 150,150 L 280,350 Z",
        defaultColor: "#4b86b4",
      },
      {
        id: "mountain_right",
        name: "Sağ Dağ",
        path: "M 220,400 L 370,180 L 480,400 Z",
        defaultColor: "#639fab",
      },
      {
        id: "bear_body",
        name: "Ayı Gövdesi ve Kolları",
        path: "M 150,300 C 130,340 120,410 150,450 C 180,470 330,470 360,450 C 380,420 380,380 350,340 C 350,340 375,320 375,290 C 375,260 340,240 300,240 L 230,240 C 180,240 160,270 150,300 Z M 210,320 C 190,340 180,380 200,420 C 220,440 280,440 300,420 C 310,400 300,340 280,320 Z",
        defaultColor: "#d97706", // Turuncu/Kahverengi
      },
      {
        id: "bear_head",
        name: "Ayı Kafası ve Kulakları",
        path: "M 170,180 C 150,195 140,230 160,250 C 180,270 260,270 280,250 C 300,230 290,195 270,180 Z M 165,190 C 155,190 145,170 155,155 C 165,145 185,155 180,175 Z M 275,190 C 285,190 295,170 285,155 C 275,145 255,155 260,175 Z",
        defaultColor: "#ea580c",
      },
      {
        id: "inner_ears",
        name: "Kulak İçi",
        path: "M 158,180 C 153,178 150,168 156,160 C 162,154 172,160 170,170 Z M 282,180 C 287,178 290,168 284,160 C 278,154 268,160 270,170 Z",
        defaultColor: "#ec4899",
      },
      {
        id: "bear_snout",
        name: "Ayı Ağız/Burun Bölgesi",
        path: "M 205,245 C 205,225 215,210 235,210 C 255,210 265,225 265,245 C 265,255 250,265 235,265 C 220,265 205,255 205,245 Z",
        defaultColor: "#facc15", // Sarı snout
      },
      {
        id: "bear_nose",
        name: "Burun",
        path: "M 225,215 C 225,210 230,205 235,205 C 240,205 245,210 245,215 C 245,220 235,225 235,225 Z",
        defaultColor: "#1e293b",
      },
      {
        id: "fish",
        name: "Kırmızı Süs Balığı",
        path: "M 390,270 C 390,250 410,240 425,240 C 440,240 450,255 440,270 C 455,265 470,275 470,290 C 470,305 450,300 440,295 C 445,310 430,320 420,310 C 410,310 395,290 390,270 Z",
        defaultColor: "#ef4444", // Kırmızı balık
      },
      {
        id: "fish_tail",
        name: "Balık Kuyruğu",
        path: "M 455,265 L 475,250 L 470,275 Z M 455,295 L 475,310 L 470,285 Z",
        defaultColor: "#dc2626",
      },
      {
        id: "seaweed",
        name: "Yosun / Zemin Çimeni",
        path: "M 20,440 L 480,440 L 480,480 L 20,480 Z",
        defaultColor: "#16a34a",
      },
    ],
  },
  {
    id: "butterfly",
    name: "Rengarenk Kelebek",
    description: "Büyük kanatları, çiçekleri ve yıldızları olan simetrik kelebek şablonu.",
    width: 500,
    height: 500,
    strokeWidth: 3,
    backgroundColor: "#0b132b",
    regions: [
      {
        id: "background",
        name: "Uzay Boşluğu",
        path: "M 0,0 L 500,0 L 500,500 L 0,500 Z",
        defaultColor: "#1c2541",
      },
      {
        id: "wing_left_outer",
        name: "Sol Kanat Dış Bölge",
        path: "M 240,230 C 220,150 120,80 50,110 C -10,135 10,270 120,310 C 160,325 210,310 240,260 Z",
        defaultColor: "#4361ee",
      },
      {
        id: "wing_right_outer",
        name: "Sağ Kanat Dış Bölge",
        path: "M 260,230 C 280,150 380,80 450,110 C 510,135 490,270 380,310 C 340,325 290,310 260,260 Z",
        defaultColor: "#4361ee",
      },
      {
        id: "wing_left_inner",
        name: "Sol Kanat İç Bölge",
        path: "M 220,230 C 200,180 140,130 90,150 C 50,170 60,240 130,270 C 160,280 200,270 220,240 Z",
        defaultColor: "#7209b7",
      },
      {
        id: "wing_right_inner",
        name: "Sağ Kanat İç Bölge",
        path: "M 280,230 C 300,180 360,130 410,150 C 450,170 440,240 370,270 C 340,280 300,270 280,240 Z",
        defaultColor: "#7209b7",
      },
      {
        id: "wing_decorations",
        name: "Kanat Süsleri",
        path: "M 110,180 Q 120,170 130,180 T 110,180 Z M 390,180 Q 380,170 370,180 T 390,180 Z M 150,220 A 15,15 0 1,1 150,219 Z M 350,220 A 15,15 0 1,1 350,219 Z",
        defaultColor: "#f72585",
      },
      {
        id: "butterfly_body",
        name: "Kelebek Gövdesi ve Kafası",
        path: "M 240,160 C 235,160 230,180 230,250 C 230,320 235,340 250,340 C 265,340 270,320 270,250 C 270,180 265,160 260,160 Z M 250,150 A 15,15 0 1,1 250,149 Z",
        defaultColor: "#ffbe0b",
      },
      {
        id: "flowers_bottom",
        name: "Alt Çiçekler",
        path: "M 100,430 C 80,410 60,440 80,460 C 60,480 90,490 100,470 C 110,490 140,480 120,460 C 140,440 120,410 100,430 Z M 400,430 C 380,410 360,440 380,460 C 360,480 390,490 400,470 C 410,490 440,480 420,460 C 440,440 420,410 400,430 Z",
        defaultColor: "#3a0ca3",
      },
      {
        id: "flower_centers",
        name: "Çiçek Merkezleri",
        path: "M 100,455 A 8,8 0 1,1 100,454 Z M 400,455 A 8,8 0 1,1 400,454 Z",
        defaultColor: "#f72585",
      },
    ],
  },
];
