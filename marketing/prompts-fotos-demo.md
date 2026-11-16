# Prompts para las fotos de perfil del Modo Demo

Fotos realistas para las 13 personas del demo (`src/lib/mock/seed.ts`). Hoy usan retratos vectoriales de
`public/demo/avatars/*.svg`. Cada persona tiene **2 fotos**: la 1 es el avatar y la tarjeta de la grilla, y la 2 se
ve en el perfil.

Los prompts están en inglés porque los generadores de imágenes (Midjourney, DALL·E, Imagen, Flux, etc.) responden mejor
así. Antes de cada prompt hay una ficha en español.

---

## 1. Cómo usarlos

1. Pegá el **bloque de estilo** (sección 2) al final de **cada** prompt. Así todas las fotos parecen de la misma noche.
2. Si el generador acepta *negative prompt*, usá el de la sección 3.
3. Formato: **vertical 3:4**, 1200 × 1600 px (mínimo 600 × 800). En Midjourney: `--ar 3:4 --style raw`.
4. Guardá cada archivo con el nombre que figura en la ficha (ej. `sofi.noche-1.webp`; si sale en PNG o JPG está bien,
   lo convertimos nosotros).
5. Para que la misma persona salga igual en sus 2 fotos, usá la opción de "personaje consistente" del generador:
   *character reference* (`--cref` en Midjourney) o la foto 1 como referencia para la 2.
6. Reglas que no se negocian:
   - Todos tienen que parecer **claramente mayores de edad**, entre 23 y 30 años (la app es +18).
   - Que **no se parezcan a nadie famoso ni a una persona real**.
   - Sin texto, sin logos de marcas y sin marcas de agua.
   - Nada sexualizado ni gente borracha: son fotos que alguien elegiría para su perfil.

**Encuadre:** las fotos de perfil son **siempre verticales 3:4** (en la app, cada persona encuadra la suya al subirla).
Generá directamente en 3:4 para que no haga falta recortar nada; la foto se ve entera, también en el avatar.
- **Foto 1:** retrato de pecho para arriba, mirando a cámara o casi, con la **cara en la mitad de arriba**. En la
  tarjeta de la grilla, el nombre y el mood van sobre la parte de abajo de la foto.
- **Foto 2:** otro momento de la misma noche (pista, barra, patio, con amigos fuera de foco). Plano medio o americano,
  con la persona igual de reconocible.

---

## 2. Bloque de estilo (pegar al final de cada prompt)

```
Candid smartphone photo taken at night inside a Buenos Aires nightclub, realistic and natural, as if posted on a dating or social profile. Shot on a modern phone with flash off, slight motion in the background, shallow depth of field. Moody club lighting: deep magenta-red (#FF1E56) and electric cyan (#00F0FF) neon accents with warm amber (#FFB800) highlights, dark near-black background. Natural skin texture with visible pores, no retouching, authentic expression. Vertical 3:4 composition, single subject in focus, background people blurred and unrecognizable. Adult aged 23–30. No text, no logos, no watermarks.
```

## 3. Negative prompt (si el generador lo acepta)

```
text, letters, logo, watermark, brand names, celebrity likeness, cartoon, illustration, 3d render, anime, plastic skin, airbrushed, overly smooth skin, extra fingers, deformed hands, distorted face, duplicate person, minor, teenager, childlike, nudity, sexualized pose, drunk, vomit, drugs, cigarettes in focus, harsh direct flash, overexposed, studio backdrop, stock photo look
```

---

## 4. Prompts por persona

### Sofía Benítez · `sofi.noche` · 26 · mujer
> Diseñadora de día, raver de noche. Si suena Peggy Gou, estoy en primera fila. · House, Techno, Pop · *Voy con amigos*

**`sofi.noche-1`**
```
Portrait of a 26-year-old Argentine woman, graphic designer, shoulder-length dark brown wavy hair, small silver hoop earrings, subtle glitter on her cheekbones, black mesh top under an oversized vintage jacket, warm confident half-smile looking at the camera, magenta neon light on one side of her face.
```
**`sofi.noche-2`**
```
The same 26-year-old Argentine woman with shoulder-length dark brown wavy hair and black mesh top, dancing in the front row near the DJ booth with arms half raised, laughing, laser beams and haze above the crowd, friends blurred around her.
```

### Camila Ríos · `cami.beats` · 25 · mujer
> Bailo hasta que prendan las luces 💡 · House, Reggaetón, Pop · *Solo vengo a bailar*

**`cami.beats-1`**
```
Portrait of a 25-year-old Argentine woman with long straight light-brown hair in a high ponytail, light olive skin, cyan-tinted light on her face, sporty-chic white crop top and small gold necklace, big genuine smile mid-laugh, looking just past the camera.
```
**`cami.beats-2`**
```
The same 25-year-old woman with the high light-brown ponytail and white crop top, caught mid-dance on a crowded dance floor, ponytail swinging, eyes closed and smiling, cyan and magenta lights streaking behind her.
```

### Julieta Paz · `juli.rkt` · 24 · mujer
> RKT y cachengue o nada. Team after. · RKT, Cachengue, Reggaetón · *Buscando after*

**`juli.rkt-1`**
```
Portrait of a 24-year-old Argentine woman with long dark curly hair, warm tan skin, bold winged eyeliner, oversized gold hoop earrings, black sports jersey style top, playful confident look straight at the camera with one eyebrow slightly raised, warm orange-red light.
```
**`juli.rkt-2`**
```
The same 24-year-old woman with long dark curly hair and gold hoops, singing along with two blurred friends, holding a plastic cup at the edge of the frame, joyful expression, red and amber club lights, energetic crowded atmosphere.
```

### Melina Duarte · `meli.house` · 27 · mujer
> Arquitecta. Me encontrás cerca de la cabina. · House, Electrónica, Indie · *Voy con amigos*

**`meli.house-1`**
```
Portrait of a 27-year-old Argentine woman, architect, short blunt black bob haircut, fair skin with freckles, thin black-framed glasses, minimalist black turtleneck sleeveless top, calm intelligent smile, purple and cyan light reflecting on her glasses.
```
**`meli.house-2`**
```
The same 27-year-old woman with the black bob and thin glasses, standing near the DJ booth looking toward the DJ with a relaxed smile, gently moving to the music, cyan haze and soft purple lights, DJ silhouette blurred in the background.
```

### Mateo Sosa · `mateo.techno` · 28 · hombre
> Techno melódico, vinilos y madrugadas largas. · Techno, House, Electrónica · *Abierto a conocer gente*

**`mateo.techno-1`**
```
Portrait of a 28-year-old Argentine man with short dark buzz-cut hair, light stubble, light brown skin, thin silver chain, plain black t-shirt, calm friendly gaze into the camera with a slight smile, cool cyan and green-tinted light on his face.
```
**`mateo.techno-2`**
```
The same 28-year-old man with the dark buzz cut and black t-shirt, dancing absorbed in the music with eyes half closed in a dark techno room, strobe and white laser lines cutting through the haze behind him.
```

### Lucas Ferreyra · `lucas.dj` · 29 · hombre
> Productor amateur. Te paso mi SoundCloud si bailás conmigo. · House, Techno · *En la barra*

**`lucas.dj-1`**
```
Portrait of a 29-year-old Argentine man, amateur music producer, medium-length messy brown hair, short beard, over-ear headphones resting around his neck, dark denim overshirt, easy charming grin, warm amber light on one side and magenta on the other.
```
**`lucas.dj-2`**
```
The same 29-year-old man with messy brown hair, short beard and headphones around his neck, leaning on a backlit bar holding a gin tonic, turning toward the camera mid-conversation with a smile, bottles glowing amber behind him.
```

### Bruno Méndez · `bruno.after` · 27 · hombre
> Conozco todos los afters de Palermo 🌅 · Techno, Urbano, RKT · *Buscando after*

**`bruno.after-1`**
```
Portrait of a 27-year-old Argentine man with wavy black hair pushed back, tanned skin, tiny gold stud earring, open short-sleeve patterned shirt over a white tank top, mischievous half-smile, purple and red club lighting.
```
**`bruno.after-2`**
```
The same 27-year-old man with wavy black hair pushed back and patterned open shirt, on an outdoor terrace at dawn after the party, sky turning soft pink and blue, wearing sunglasses pushed up on his head, relaxed tired happy smile, city rooftops of Buenos Aires blurred behind.
```

### Joaquín Vera · `joaco.indie` · 26 · hombre
> Indie, synths y charlas en el patio. · Indie, Pop, Electrónica · *Abierto a conocer gente*

**`joaco.indie-1`**
```
Portrait of a 26-year-old Argentine man with curly chestnut hair, fair skin, light freckles, thin mustache, vintage corduroy jacket over a striped shirt, shy warm smile, soft green-cyan neon light.
```
**`joaco.indie-2`**
```
The same 26-year-old man with curly chestnut hair and corduroy jacket, sitting on a bench in a club's open-air patio with string lights and plants, talking and laughing with someone off-frame, holding a beer bottle with no visible label.
```

### Valentina Gómez · `vale.pop` · 23 · mujer
> Pop girlie. Hoy en pareja, vengo por los sorteos 🎟️ · Pop, Reggaetón, Urbano · *Solo vengo a bailar*

**`vale.pop-1`**
```
Portrait of a 23-year-old Argentine woman with long honey-blonde hair with soft waves, light skin, pink glossy lips, small star-shaped clips in her hair, sparkly pink top, bright cheerful smile at the camera, pink and amber lighting.
```
**`vale.pop-2`**
```
The same 23-year-old woman with long honey-blonde wavy hair and star hair clips, singing a pop chorus with her eyes closed and one hand in the air, confetti falling in the air, pink and gold lights, holding hands with a blurred partner whose face is not visible.
```

### Tomás Aguirre · `tomi.vip` · 30 · hombre
> Mesa VIP con amigos. Sumate si venís con buena onda 🍾 · Reggaetón, Urbano, House · *Voy con amigos*

**`tomi.vip-1`**
```
Portrait of a 30-year-old Argentine man with neatly styled dark hair with a fade, well-groomed short beard, medium-brown skin, black button-up shirt with top button open, simple watch, confident friendly smile, warm golden amber light.
```
**`tomi.vip-2`**
```
The same 30-year-old man with the styled dark hair, groomed beard and black shirt, at a VIP table with velvet seating, raising a glass for a toast with blurred friends, sparkler candle on a bottle glowing gold in the background (no visible labels).
```

### Nicolás Paredes · `nico.urbano` · 28 · hombre
> Urbano, trap y fernet. · Urbano, Reggaetón, RKT · *En la barra*

**`nico.urbano-1`**
```
Portrait of a 28-year-old Argentine man with short black twists, dark brown skin, small diamond-like stud earrings, oversized black hoodie with no logos, thin gold chain, laid-back cool expression with a subtle smile, deep blue and red lighting.
```
**`nico.urbano-2`**
```
The same 28-year-old man with short black twists and black hoodie, at the bar holding a tall glass of dark fernet and cola with ice, laughing with a friend off-frame, red neon glow on the bar counter.
```

### Francisca Luna · `fran.cachengue` · 25 · mujer
> Cachengue hasta el amanecer. Solo Rompehielos de gente que conecté 😌 · Cachengue, Reggaetón, Pop · *Abierto a conocer gente*

**`fran.cachengue-1`**
```
Portrait of a 25-year-old Argentine woman with long straight jet-black hair with a middle part, light brown skin, dramatic lashes, red lipstick, red satin slip top, self-assured relaxed expression with a knowing smile, red and amber lighting.
```
**`fran.cachengue-2`**
```
The same 25-year-old woman with long straight black hair and red satin top, dancing with a group of blurred friends, head tilted back laughing, warm red and gold lights, festive crowded dance floor.
```

### Gonzalo Ibarra · `gonza.x` · 27 · hombre
> Sin bio · House, Techno · *Abierto a conocer gente*
> En el demo es el perfil **bloqueado** (sirve para mostrar la lista negra), así que lo que importa es que se vea
> como una foto común y discreta.

**`gonza.x-1`**
```
Portrait of a 27-year-old Argentine man with short light-brown hair, clean-shaven, fair skin, plain grey t-shirt, neutral polite expression looking at the camera, dim cool grey-blue light, simple and unremarkable profile photo.
```
**`gonza.x-2`**
```
The same 27-year-old man with short light-brown hair and grey t-shirt, standing near the club entrance with his phone in hand, dim blue lighting, crowd blurred behind.
```

---

## 5. Opcional: el equipo del evento

Hoy no tienen fotos en el demo (en el panel aparecen las iniciales). Si querés que se vean más reales, generá **una
foto por persona** con el mismo bloque de estilo, pero en clave de trabajo: ropa negra de staff, credencial sin texto
legible, luz de la barra o de la puerta.

| Archivo | Persona | Prompt base |
|---|---|---|
| `paula.owner-1` | Paula Ferrari, 32, dueña de la productora | `Portrait of a 32-year-old Argentine woman, nightclub owner and event producer, sleek dark hair in a low bun, black blazer, headset earpiece, confident professional smile, standing by the DJ booth before doors open.` |
| `lucho.produccion-1` | Luciano Paz, 30, producción | `Portrait of a 30-year-old Argentine man, event production manager, short curly hair, black staff t-shirt, radio clipped to his belt, focused friendly look, backstage club lights.` |
| `dani.barra-1` | Daniela Ortiz, 30, jefa de barra | `Portrait of a 30-year-old Argentine woman, head bartender, hair tied back with a bandana, black apron, tattoos on forearms, shaking a cocktail behind a backlit bar, warm smile.` |
| `tomas.mozo-1` | Tomás Rey, 30, mozo VIP | `Portrait of a 30-year-old Argentine man, VIP table waiter, neat short hair, black shirt, carrying a tray with a champagne bucket, polite smile, amber VIP lounge lights.` |
| `marta.seguridad-1` | Marta Gómez, 30, seguridad | `Portrait of a 30-year-old Argentine woman, nightclub security coordinator, hair in a tight ponytail, black jacket with a plain armband, earpiece, calm attentive expression, standing at the club entrance.` |
| `vicky.rrpp-1` | Victoria Sosa, 30, RRPP | `Portrait of a 30-year-old Argentine woman, nightclub promoter, long wavy auburn hair, stylish black outfit, holding a phone, outgoing bright smile, neon entrance sign glow without readable letters.` |

---

## 6. Cuando estén listas

Pasá los archivos (los 26 de las personas y, si los hiciste, los 6 del equipo) y del lado del código:

- se comprimen a **WebP de 600 × 800** (unos 40–60 KB cada uno, por la regla de baja señal),
- se guardan en `public/demo/avatars/` y se apuntan desde `seed.ts` (`.svg` → `.webp`, con el `blur_color` real de cada foto),
- se sube `STATE_VERSION` para que la demo se vuelva a generar con las fotos nuevas,
- se vuelven a sacar las capturas comerciales (`scripts/capture-landing-shots.cjs`).
