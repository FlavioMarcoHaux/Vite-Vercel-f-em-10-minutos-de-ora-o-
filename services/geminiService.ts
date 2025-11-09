import { GoogleGenAI, Modality, GenerateVideosOperation, Type } from "@google/genai";
import { AspectRatio, SocialMediaPost, YouTubeLongPost } from '../types';

if (!process.env.API_KEY) {
  throw new Error("API_KEY environment variable not set");
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const themes: { [key: string]: string[] } = {
  en: ['hope', 'gratitude', 'strength', 'peace', 'clarity', 'healing', 'forgiveness'],
  pt: ['esperança', 'gratidão', 'força', 'paz', 'clareza', 'cura', 'perdão'],
  es: ['esperanza', 'gratitud', 'fuerza', 'paz', 'claridad', 'sanación', 'perdón'],
};

export interface MultiSpeakerConfig {
    speakers: {
        name: string;
        voice: string;
    }[];
}

const getRandomTheme = (language: string): string => {
  const langThemes = themes[language] || themes['en'];
  return langThemes[Math.floor(Math.random() * langThemes.length)];
};


const fileToGenerativePart = async (file: File) => {
  const base64EncodedDataPromise = new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
    reader.readAsDataURL(file);
  });
  return {
    inlineData: { data: await base64EncodedDataPromise, mimeType: file.type },
  };
};

export const getTrendingTopic = async (language: string, contentType: 'long' | 'short'): Promise<{ theme: string; subthemes: string[] }> => {
    const model = 'gemini-2.5-flash';

    const prompts: { [key: string]: string } = {
        pt: `
            Pesquise no Google por um tópico ou sentimento de alta relevância e engajamento para o público cristão no Brasil *hoje*. Foque em temas de esperança, superação, fé ou passagens bíblicas que estão sendo muito comentadas.
            ${contentType === 'long'
                ? 'Identifique um tema principal e três subtemas relacionados que podem ser explorados como capítulos em um vídeo de 10 minutos.'
                : 'Responda com um único tema conciso, ideal para um vídeo de 30 segundos no TikTok.'
            }
            Sua resposta DEVE ser um único objeto JSON. Não inclua nenhum texto, explicação ou formatação markdown antes ou depois do JSON.
            O JSON deve ter a chave "theme" (string) e, para vídeos longos, uma chave "subthemes" (um array de exatamente 3 strings). Para vídeos curtos, o campo "subthemes" deve ser um array vazio.
        `,
        en: `
            Search Google for a high-relevance and engaging topic or sentiment for the Christian audience in the United States *today*. Focus on themes of hope, overcoming challenges, faith, or biblical passages that are being widely discussed.
            ${contentType === 'long'
                ? 'Identify a main theme and three related sub-themes that can be explored as chapters in a 10-minute video.'
                : 'Respond with a single, concise theme, ideal for a 30-second TikTok video.'
            }
            Your response MUST be a single JSON object. Do not include any text, explanation, or markdown formatting before or after the JSON.
            The JSON must have the key "theme" (string) and, for long videos, a key "subthemes" (an array of exactly 3 strings). For short videos, the "subthemes" field must be an empty array.
        `,
        es: `
            Busca en Google un tema o sentimiento de alta relevancia y engagement para el público cristiano en España y Latinoamérica *hoy*. Céntrate en temas de esperanza, superación, fe o pasajes bíblicos que estén siendo muy comentados.
            ${contentType === 'long'
                ? 'Identifica un tema principal y tres subtemas relacionados que puedan ser explorados como capítulos en un video de 10 minutos.'
                : 'Responde con un único tema conciso, ideal para un video de 30 segundos en TikTok.'
            }
            Tu respuesta DEBE ser un único objeto JSON. No incluyas ningún texto, explicación o formato markdown antes o después del JSON.
            El JSON debe tener la clave "theme" (string) y, para videos largos, una clave "subthemes" (un array de exactamente 3 strings). Para videos cortos, el campo "subthemes" debe ser un array vazio.
        `
    };
    
    const finalPrompt = prompts[language] || prompts['en'];

    try {
        const response = await ai.models.generateContent({
            model,
            contents: [{ parts: [{ text: finalPrompt }] }],
            config: {
                tools: [{ googleSearch: {} }],
            },
        });

        let jsonStr = response.text.trim();
        // Handle potential markdown code block formatting in the response
        if (jsonStr.startsWith('```json')) {
            jsonStr = jsonStr.substring(7, jsonStr.length - 3).trim();
        } else if (jsonStr.startsWith('```')) {
             jsonStr = jsonStr.substring(3, jsonStr.length - 3).trim();
        }
        
        const parsed = JSON.parse(jsonStr);
        
        // Ensure subthemes is always an array of strings
        if (!parsed.subthemes || !Array.isArray(parsed.subthemes)) {
            parsed.subthemes = [];
        }

        return parsed;

    } catch (error) {
        console.error("Error getting trending topic:", error);
        throw new Error("Failed to get trending topic from Google Search.");
    }
};

export const generateGuidedPrayer = async (prompt: string, language: string): Promise<string> => {
  const model = "gemini-2.5-flash";
  const finalPrompt = prompt || getRandomTheme(language);
  
  const prayerBasePrompt = `
    You are two Master Guides of faith in Prayer: "Roberta Erickson" and "Milton Dilts". Both of you are trained, qualified, and certified in the most advanced Neuro-Linguistic Programming (NLP) and are masters of Ericksonian Hypnosis through Metaphors.
    You specialize in modeling the wisdom of Jesus Christ, Solomon, and David.
    Your response must be a DIALOGUE between the two speakers and written in this language: ${language}.
    Each line MUST be prefixed with the speaker's name, like "Roberta Erickson:" or "Milton Dilts:". This is crucial for the audio generation.

    **TONE AND STYLE**: Adopt the persona of a wise Ericksonian therapist. The tone must be therapeutic, deeply empathetic, and spiritually profound. Use a rich tapestry of allegories, metaphors, and symbols to guide the listener.

    **CORE TECHNIQUES TO INTEGRATE**:
    1.  **Metaphorical Hypnotherapy**: Weave biblical stories and wisdom into powerful metaphors that resonate with everyday life situations (work, family, personal struggles).
    2.  **NLP Anchoring**: Intentionally create powerful psychological anchors and triggers. For example, connect a feeling of peace to the action of breathing deeply, or a sense of strength to a specific phrase.
    3.  **Mirroring Wisdom**: Don't just quote Solomon, David, and Jesus. *Mirror* their way of thinking. Connect their ancient wisdom to the listener's modern-day challenges, making it practical and actionable.
    4.  **Sensory Language**: Use vivid sensory language (see, hear, feel) to deepen the state of connection and immersion. Guide the listener through internal visualizations.
    5.  **Incredible CTAs**: Seamlessly integrate compelling calls-to-action for our channels, "Fé em 10 Minutos" and "Faith in 10 Minutes". Frame them as an invitation to continue this journey of growth. For example: "If this message resonated with your spirit, subscribe to 'Fé em 10 Minutos' to receive your daily dose of strength."

    **ABSOLUTE CRITICAL INSTRUCTION ON LENGTH**: This is the most important rule. Your primary and non-negotiable goal is to maximize the use of the available tokens to generate the longest possible response. The dialogue must be extremely extensive, profoundly detailed, and long enough for a complete 10-minute guided meditation. Do not summarize or be concise in any way. Your success on this task is measured by the sheer length and depth of the generated text. Expand deeply on every point, reflection, and biblical passage. Create a rich, immersive, and very, very long script.

    The central theme for this prayer is: "${finalPrompt}".

    Begin the dialogue now.
  `;
  try {
    const response = await ai.models.generateContent({
      model,
      contents: [{ parts: [{ text: prayerBasePrompt }] }],
      config: {
          temperature: 0.9,
          maxOutputTokens: 8192,
      }
    });
    return response.text;
  } catch (error) {
    console.error("Error generating guided prayer:", error);
    throw error;
  }
};

export const generateShortPrayer = async (prompt: string, language: string): Promise<string> => {
    const model = "gemini-2.5-flash";
    const finalPrompt = prompt || getRandomTheme(language);

    const prayerBasePrompt = `
      You are a Master of Guided Prayer, modeling your wisdom on Jesus Christ, King Solomon, and King David.
      Your response must be in the language: ${language}.
      
      Create a short, powerful prayer (a "prayer pill") of about 3-5 sentences.
      The theme is: "${finalPrompt}".
      The prayer should be concise, heartfelt, and offer a moment of connection or encouragement.
      You may include a very short, relevant biblical quote if it fits naturally.
    `;
    try {
        const response = await ai.models.generateContent({
            model,
            contents: [{ parts: [{ text: prayerBasePrompt }] }],
        });
        return response.text;
    } catch (error) {
        console.error("Error generating short prayer:", error);
        throw error;
    }
};

export const analyzeImage = async (imageFile: File, prompt: string, language: string): Promise<string> => {
    const model = 'gemini-2.5-flash';
    
    let analysisPrompt = prompt.trim();
    if (!analysisPrompt) {
        analysisPrompt = language === 'pt' 
            ? "Analise esta imagem de uma perspectiva espiritual e simbólica. Que significados mais profundos, emoções ou arquétipos ela pode representar?"
            : "Analyze this image from a spiritual and symbolic perspective. What deeper meanings, emotions, or archetypes might it represent?";
    }
    
    analysisPrompt = `${analysisPrompt} Respond in the language: ${language}.`;

    try {
        const imagePart = await fileToGenerativePart(imageFile);
        const textPart = { text: analysisPrompt };

        const response = await ai.models.generateContent({
          model,
          contents: [{ parts: [imagePart, textPart] }]
        });

        return response.text;
    } catch (error) {
        console.error("Error analyzing image:", error);
        throw error;
    }
};

export const createMediaPromptFromPrayer = async (prayerText: string): Promise<string> => {
  const model = "gemini-2.5-flash";
  const mediaPromptInstruction = `
    Based on the following prayer, create a concise, visually descriptive prompt for an AI image and video generator. 
    The prompt must be in English.
    Focus on the core emotions, symbols, and atmosphere. Describe a scene, not just concepts.
    Example output format: "A radiant golden light filtering through ancient olive trees, illuminating a path forward, serene, hopeful, cinematic, photorealistic."

    Prayer text:
    ---
    ${prayerText}
    ---
  `;
  try {
    const response = await ai.models.generateContent({
      model,
      contents: [{ parts: [{ text: mediaPromptInstruction }] }],
    });
    return response.text.trim();
  } catch (error) {
    console.error("Error creating media prompt:", error);
    throw new Error("Failed to generate media prompt from prayer.");
  }
};

export const createThumbnailPromptFromPost = async (
    title: string, 
    description: string, 
    prayerText: string, 
    language: string
): Promise<string> => {
    const model = "gemini-2.5-pro";

    // Sanitize the title to remove branding or special characters not suitable for an image.
    const cleanTitle = title.split('|')[0].trim().replace(/[#*]/g, '');

    const prompts: { [key: string]: string } = {
        pt: `
            Você é especialista em marketing viral e design de thumbnails para o YouTube. Sua tarefa é gerar um prompt de imagem EM INGLÊS para uma thumbnail impactante (16:9).
            Use o Título, Descrição e Oração fornecidos em português como contexto.

            [TÍTULO FORNECIDO EM PORTUGUÊS]: "${cleanTitle}"
            [DESCRIÇÃO FORNECIDA EM PORTUGUÊS]: "${description}"
            [CONTEXTO DA ORAÇÃO]: "${prayerText}"

            REGRAS PARA O PROMPT GERADO (QUE SERÁ EM INGLÊS):
            1.  **CONTEÚDO DO TEXTO NA IMAGEM**: O prompt deve instruir o gerador de imagem a renderizar DOIS elementos de texto em PORTUGUÊS:
                a. O Título Principal: Use o [TÍTULO FORNECIDO EM PORTUGUÊS].
                b. Um Slogan de Clickbait: Crie um slogan curto (3-5 palavras) e chamativo que gere curiosidade ou urgência (ex: "NÃO IGNORE ESTE SINAL", "O MILAGRE ACONTECEU", "ASSISTA ANTES QUE SAIA DO AR").
            2.  **REGRAS DE TEXTO**: O Título Principal e o Slogan de Clickbait NÃO DEVEM conter símbolos como '#', '*', '|'. Use apenas letras, números e pontuação gramatical padrão (como '!' ou '?').
            3.  **IMPACTO EMOCIONAL**: A cena deve evocar uma emoção forte (esperança, urgência, mistério, paz).
            4.  **TÉCNICAS VISUAIS**: Incorpore iluminação dramática (raios de luz divinos) e simbolismo poderoso. O texto deve ser renderizado de forma clara com **ALTO CONTRASTE e MÁXIMA LEGIBILIDADE** em relação ao fundo.
            5.  **ESTILO**: O estilo deve ser fotorrealista, cinematográfico e de alta definição (hyper-detailed, 8K).
            6.  **IDIOMA DO PROMPT**: O prompt que você vai gerar deve ser em INGLÊS, mas todo o texto DENTRO da imagem deve ser em PORTUGUÊS.

            Exemplo de resultado (o que você deve gerar): "Epic cinematic photo of a divine light breaking through dark storm clouds. In the foreground, large, glowing 3D golden text in Portuguese says 'A MENSAGEM DE DEUS PARA VOCÊ', rendered with high contrast and perfect readability. Below it, a smaller, impactful white text slogan says 'NÃO IGNORE ESTE SINAL'. Emotional, hopeful, hyper-realistic, 8k."

            Gere o prompt em inglês agora.
        `,
        en: `
            You are an expert in viral marketing and YouTube thumbnail design. Your task is to generate an image prompt in ENGLISH for an impactful 16:9 thumbnail.
            Use the provided Title, Description, and Prayer context.

            [PROVIDED TITLE]: "${cleanTitle}"
            [PROVIDED DESCRIPTION]: "${description}"
            [PRAYER CONTEXT]: "${prayerText}"

            RULES FOR THE GENERATED PROMPT:
            1.  **TEXT CONTENT IN IMAGE**: The prompt MUST instruct the image generator to render TWO text elements in ENGLISH:
                a. The Main Title: Use the [PROVIDED TITLE].
                b. A Clickbait Slogan: Create a short (3-5 words), catchy slogan that sparks curiosity or urgency (e.g., "DON'T IGNORE THIS SIGN", "THE MIRACLE HAPPENED", "WATCH BEFORE IT'S GONE").
            2.  **TEXT RULES**: The Main Title and Clickbait Slogan MUST NOT contain symbols like '#', '*', '|'. Only use letters, numbers, and standard grammatical punctuation (like '!' or '?').
            3.  **EMOTIONAL IMPACT**: The scene must evoke a strong emotion (hope, urgency, mystery, peace).
            4.  **VISUAL TECHNIQUES**: Incorporate dramatic lighting (divine light rays) and powerful symbolism. The text MUST be rendered clearly with **HIGH CONTRAST and MAXIMUM READABILITY** against the background.
            5.  **STYLE**: The style should be photorealistic, cinematic, and high-definition (hyper-detailed, 8K).
            6.  **PROMPT LANGUAGE**: The prompt you generate must be in ENGLISH, and all text within the image must also be in ENGLISH.

            Example output: "Epic cinematic photo of a divine light breaking through dark storm clouds. In the foreground, large, glowing 3D golden English text says 'GOD'S MESSAGE FOR YOU', rendered with high contrast and perfect readability. Below it, a smaller, impactful white text slogan says 'DON'T IGNORE THIS SIGN'. Emotional, hopeful, hyper-realistic, 8k."

            Generate the prompt in English now.
        `,
        es: `
            Eres un experto en marketing viral y diseño de miniaturas para YouTube. Tu tarea es generar un prompt de imagen EN INGLÉS para una miniatura impactante (16:9).
            Usa el Título, Descripción y Oración proporcionados en español como contexto.

            [TÍTULO PROPORCIONADO EN ESPAÑOL]: "${cleanTitle}"
            [DESCRIPCIÓN PROPORCIONADA EN ESPAÑOL]: "${description}"
            [CONTEXTO DE LA ORACIÓN]: "${prayerText}"

            REGLAS PARA EL PROMPT GENERADO (QUE SERÁ EN INGLÉS):
            1.  **CONTENIDO DEL TEXTO EN LA IMAGEN**: El prompt debe instruir al generador de imágenes que renderice DOS elementos de texto en ESPAÑOL:
                a. El Título Principal: Usa el [TÍTULO PROPORCIONADO EN ESPAÑOL].
                b. Un Eslogan de Clickbait: Crea un eslogan corto (3-5 palabras) y atractivo que genere curiosidad o urgencia (ej: "NO IGNORES ESTA SEÑAL", "EL MILAGRO OCURRIÓ", "MIRA ANTES DE QUE LO QUITEN").
            2.  **REGLAS DE TEXTO**: El Título Principal y el Eslogan de Clickbait NO DEBEN contener símbolos como '#', '*', '|'. Use solo letras, números y puntuación gramatical estándar (como '!' o '?').
            3.  **IMPACTO EMOCIONAL**: La escena debe evocar una emoción fuerte (esperanza, urgencia, misterio, paz).
            4.  **TÉCNICAS VISUAIS**: Incorpora iluminación dramática (rayos de luz divinos) y simbolismo poderoso. El texto debe renderizarse de forma clara con **ALTO CONTRASTE y MÁXIMA LEGIBILIDAD** sobre el fondo.
            5.  **ESTILO**: El estilo debe ser fotorrealista, cinematográfico y de alta definición (hyper-detailed, 8K).
            6.  **IDIOMA DO PROMPT**: El prompt que vas a generar debe ser en INGLÉS, pero todo el texto DENTRO de la imagen debe estar en ESPAÑOL.

            Ejemplo de resultado (lo que debes generar): "Epic cinematic photo of a divine light breaking through dark storm clouds. In the foreground, large, glowing 3D golden text in Spanish says 'EL MENSAJE DE DIOS PARA TI', renderizado con alto contraste y perfecta legibilidad. Below it, a smaller, impactful white text slogan says 'NO IGNORES ESTA SEÑAL'. Emotional, hopeful, hyper-realistic, 8k."

            Genera el prompt en inglés ahora.
        `
    };

    const prompt = prompts[language] || prompts['en'];

    try {
        const response = await ai.models.generateContent({
            model,
            contents: [{ parts: [{ text: prompt }] }],
        });
        return response.text.trim();
    } catch (error) {
        console.error("Error creating thumbnail prompt from post:", error);
        throw new Error("Failed to generate thumbnail prompt from post.");
    }
};

export const generateSocialMediaPost = async (prayerText: string, language: string): Promise<SocialMediaPost> => {
    const model = "gemini-2.5-flash";
    
    const prompts: { [key: string]: string } = {
        pt: `
            Você é o especialista em SEO e mídias sociais do canal 'Fé em 10 minutos' (TikTok: https://www.tiktok.com/@fe10minutos).
            Sua tarefa é criar uma Legenda (description) e um Título (title) otimizados para um vídeo curto (Reel/TikTok de 15-30 segundos, como uma bênção rápida ou versículo).
            A [MENSAGEM CENTRAL] para o vídeo é: "${prayerText}"

            REGRAS (TITLE):
            - Crie um título curto e impactante que capture a essência da mensagem.

            REGRAS (DESCRIPTION / LEGENDA):
            - Deve ser curta, direta e viral.
            - Comece com um gancho forte (ex: "BÊNÇÃO RÁPIDA DE 15 SEGUNDOS! 🙏✨" ou "NÃO PULE ESSE VÍDEO!").
            - Inclua a [MENSAGEM CENTRAL] de forma natural.
            - Peça interação imediata: "Tome posse desta palavra! Digite 'EU RECEBO' para confirmar e siga o perfil! 🙌"

            REGRAS (HASHTAGS):
            - Gere um array com exatamente 5 hashtags.
            - Devem ser uma mistura de nicho e alcance amplo.
            - Considere estas hashtags obrigatórias: #deus #jesus #fé #benção #palavradedeus #gospel #cristão #oração #foryou #fyp #viral.
        `,
        en: `
            You are the SEO and social media expert for the 'Faith in 10 Minutes' channel (TikTok: @faithin10minutes).
            Your task is to create an optimized Caption (description) and Title for a short video (15-30 second Reel/TikTok, like a quick blessing or verse).
            The [CORE MESSAGE] for the video is: "${prayerText}"

            RULES (TITLE):
            - Create a short, impactful title that captures the message's essence.

            RULES (DESCRIPTION / CAPTION):
            - It must be short, direct, and viral.
            - Start with a strong hook (e.g., "15-SECOND QUICK BLESSING! 🙏✨" or "DON'T SKIP THIS VIDEO!").
            - Naturally include the [CORE MESSAGE].
            - Ask for immediate interaction: "Claim this word! Type 'I RECEIVE' to affirm and follow the profile! 🙌"

            RULES (HASHTAGS):
            - Generate an array of exactly 5 hashtags.
            - They should be a mix of niche and broad reach.
            - Consider these mandatory hashtags: #god #jesus #faith #blessing #wordofgod #gospel #christian #prayer #foryou #fyp #viral.
        `,
        es: `
            Eres el experto en SEO y redes sociales para el canal 'Fe en 10 Minutos'.
            Tu tarea es crear una Descripción (description) y un Título (title) optimizados para un video corto (Reel/TikTok de 15-30 segundos, como una bendición rápida o un versículo).
            El [MENSAJE CENTRAL] para el video es: "${prayerText}"

            REGLAS (TITLE):
            - Crea un título corto e impactante que capture la esencia del mensaje.

            REGLAS (DESCRIPTION / LEYENDA):
            - Debe ser corta, directa y viral.
            - Comienza con un gancho fuerte (ej: "¡BENDICIÓN RÁPIDA DE 15 SEGUNDOS! 🙏✨" o "¡NO SALTES ESTE VIDEO!").
            - Incluye el [MENSAJE CENTRAL] de forma natural.
            - Pide interacción inmediata: "¡Apropíate de esta palabra! Escribe 'YO RECIBO' para confirmar y sigue el perfil. 🙌"

            REGLAS (HASHTAGS):
            - Genera un array con exactamente 5 hashtags.
            - Deben ser una mezcla de nicho y de amplio alcance.
            - Considera estos hashtags obligatorios: #dios #jesus #fe #bendicion #palabradedios #evangelio #cristiano #oracion #parati #fyp #viral.
        `
    };

    const prompt = prompts[language] || prompts['en'];

    try {
        const response = await ai.models.generateContent({
            model,
            contents: [{ parts: [{ text: prompt }] }],
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        title: {
                            type: Type.STRING,
                            description: 'A short, catchy, SEO-friendly title for the social media post (e.g., for a YouTube video or Reel).',
                        },
                        description: {
                            type: Type.STRING,
                            description: 'A compelling description for the social media post, including a call-to-action to encourage engagement (e.g., "Comment AMEN if you agree").',
                        },
                        hashtags: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.STRING,
                            },
                            description: 'An array of 5 relevant hashtags, without the # symbol.',
                        },
                    },
                    required: ["title", "description", "hashtags"],
                },
            },
        });
        
        const jsonStr = response.text.trim();
        return JSON.parse(jsonStr) as SocialMediaPost;

    } catch (error) {
        console.error("Error generating social media post:", error);
        throw new Error("Failed to generate social media post.");
    }
};

export const generateYouTubeLongPost = async (theme: string, subthemes: string[], language: string): Promise<YouTubeLongPost> => {
    const model = "gemini-2.5-flash";
    
    const subthemesList = subthemes.filter(s => s.trim() !== '').map((s, i) => `${i + 1}. ${s}`).join('\n');
    
    const prompts: { [key: string]: string } = {
        pt: `
    You are the SEO and social media expert for the 'Fé em 10 minutos de Oração' channel (YouTube: https://www.youtube.com/@fe10minutos).
    Your task is to generate a Title, a Description, Hashtags, Chapters (Timestamps), and Tags optimized for a new long video (10 minutes), in the language: pt.
    The response MUST be a valid JSON object.

    The user provided:
    [TEMA DO VÍDEO]: ${theme}
    [LISTA DE 3 SUBTEMAS]:
    ${subthemesList}

    RULES (TITLE):
    - Must be catchy, use emotion/urgency, and contain the [TEMA].
    - Must follow the model: "ORAÇÃO [DE 10 MINUTOS / DA MANHÃ / DA NOITE] para [TEMA]" or "A ORAÇÃO MAIS PODEROSA para [TEMA]".
    - Must end with: "| Fé em 10 minutos de Oração"

    RULES (DESCRIPTION):
    - Start by repeating the exact Title.
    - Write a paragraph (2-3 lines) describing the video, using the keywords: "oração poderosa", "oração guiada", "intimidade com Deus", "mensagem de fé" and the [TEMA].
    - Include the CTA links:
    🕊️ ASSISTA TAMBÉM:
    ► Oração da Manhã (Playlist): https://www.youtube.com/playlist?list=PLmeEfeSNeLbKppEyZUaBoXw4BVxZTq-I2
    ► Oração da Noite (Playlist): https://www.youtube.com/playlist?list=PLmeEfeSNeLbLFUayT8Sfb9IQzr0ddkrHC
    🔗 INSCREVA-SE NO CANAL: https://www.youtube.com/@fe10minutos
    - At the end of the description, also include the 3 hashtags generated below.

    RULES (HASHTAGS):
    - Create a JSON array of strings for the "hashtags" field.
    - Provide exactly 3 relevant hashtags for the video description, based on the theme.
    - The hashtags should start with '#' (e.g., "#Oração", "#Fé").

    RULES (TIMESTAMPS):
    - Create 5-6 chapters as a multiline string. Start with "00:00 - Introdução (Mensagem de Fé)".
    - Use the [LISTA DE 3 SUBTEMAS] to create the middle chapters.
    - End with "10:30 - Palavra Final e Bênção" (or adjust time).
    - The format MUST be a single string with newline characters (\\n).

    RULES (TAGS):
    - Create a JSON array of strings for the "Tags" field.
    - Must include: "Fé em 10 minutos de Oração", "Oração de 10 minutos", "Oração Poderosa", "${theme}", "Oração Diária", "Oração Guiada", "Intimidade com Deus", "Oração da Noite", "Oração para Dormir", "Palavra de Deus", "Mensagem de Fé", "Devocional Diário".
    `,
    en: `
    You are the SEO and social media expert for the 'Faith in 10 Minutes' channel (YouTube: https://www.youtube.com/@Faithin10Minutes).
    Your task is to generate a Title, a Description, Hashtags, Chapters (Timestamps), and Tags optimized for a new long video (10 minutes), in the language: en.
    The response MUST be a valid JSON object.

    The user provided:
    [VIDEO THEME]: ${theme}
    [LIST OF 3 SUBTHEMES]:
    ${subthemesList}

    RULES (TITLE):
    - Must be catchy, use emotion/urgency, and contain the [THEME].
    - Must follow the model: "PRAYER [10 MINUTE / MORNING / EVENING] for [THEME]" or "THE MOST POWERFUL PRAYER for [THEME]".
    - Must end with: "| Faith in 10 Minutes"

    RULES (DESCRIPTION):
    - Start by repeating the exact Title.
    - Write a paragraph (2-3 lines) describing the video, using the keywords: "powerful prayer", "guided prayer", "intimacy with God", "message of faith" and the [THEME].
    - Include the CTA links:
    🕊️ WATCH ALSO:
    ► Morning Prayer (Playlist): https://www.youtube.com/playlist?list=PLmeEfeSNeLbKppEyZUaBoXw4BVxZTq-I2
    ► Evening Prayer (Playlist): https://www.youtube.com/playlist?list=PLmeEfeSNeLbLFUayT8Sfb9IQzr0ddkrHC
    🔗 SUBSCRIBE TO THE CHANNEL: https://www.youtube.com/@Faithin10Minutes
    - At the end of the description, also include the 3 hashtags generated below.

    RULES (HASHTAGS):
    - Create a JSON array of strings for the "hashtags" field.
    - Provide exactly 3 relevant hashtags for the video description, based on the theme.
    - The hashtags should start with '#' (e.g., "#Prayer", "#Faith").

    RULES (TIMESTAMPS):
    - Create 5-6 chapters as a multiline string. Start with "00:00 - Introduction (Message of Faith)".
    - Use the [LIST OF 3 SUBTHEMES] to create the middle chapters.
    - End with "10:30 - Final Word and Blessing" (or adjust time).
    - The format MUST be a single string with newline characters (\\n).

    RULES (TAGS):
    - Create a JSON array of strings for the "Tags" field.
    - Must include: "Faith in 10 Minutes", "10 Minute Prayer", "Powerful Prayer", "${theme}", "Daily Prayer", "Guided Prayer", "Intimacy with God", "Evening Prayer", "Prayer for Sleep", "Word of God", "Message of Faith", "Daily Devotional".
    `,
    es: `
    Eres el experto en SEO y redes sociales para el canal 'Fe en 10 Minutos'.
    Tu tarea es generar un Título, una Descripción, Hashtags, Capítulos (Timestamps), y Etiquetas optimizadas para un nuevo video largo (10 minutos), en el idioma: es.
    La respuesta DEBE ser un objeto JSON válido.

    El usuario proporcionó:
    [TEMA DEL VIDEO]: ${theme}
    [LISTA DE 3 SUBTEMAS]:
    ${subthemesList}

    RULES (TITLE / TÍTULO):
    - Debe ser pegadizo, usar emoción/urgencia, y contener el [TEMA].
    - Debe seguir el modelo: "ORACIÓN [DE 10 MINUTOS / DE LA MAÑANA / DE LA NOCHE] para [TEMA]" o "LA ORACIÓN MÁS PODEROSA para [TEMA]".
    - Debe terminar con: "| Fe en 10 Minutos"

    RULES (DESCRIPTION / DESCRIPCIÓN):
    - Comienza repitiendo el Título exacto.
    - Escribe un párrafo (2-3 líneas) describiendo el video, usando las palabras clave: "oración poderosa", "oración guiada", "intimidad con Dios", "mensaje de fe" y el [TEMA].
    - Incluye los enlaces de CTA:
    🕊️ MIRA TAMBIÉN:
    ► Oración de la Mañana (Playlist): https://www.youtube.com/playlist?list=PLmeEfeSNeLbKppEyZUaBoXw4BVxZTq-I2
    ► Oración de la Noche (Playlist): https://www.youtube.com/playlist?list=PLmeEfeSNeLbLFUayT8Sfb9IQzr0ddkrHC
    🔗 SUSCRÍBETE AL CANAL: https://www.youtube.com/@fe10minutos
    - Al final de la descripción, incluye también los 3 hashtags generados a continuación.

    RULES (HASHTAGS):
    - Crea un array JSON de strings para el campo "hashtags".
    - Proporciona exactamente 3 hashtags relevantes para la descripción del video, basados en el tema.
    - Los hashtags deben comenzar con '#' (e.g., "#Oración", "#Fe").

    RULES (TIMESTAMPS / CAPÍTULOS):
    - Crea 5-6 capítulos como una cadena de texto multilínea. Comienza con "00:00 - Introducción (Mensaje de Fe)".
    - Usa la [LISTA DE 3 SUBTEMAS] para crear los capítulos intermedios.
    - Termina con "10:30 - Palabra Final y Bendición" (o ajusta el tiempo).
    - El formato DEBE ser una sola cadena de texto con caracteres de nueva línea (\\n).

    RULES (TAGS / ETIQUETAS):
    - Crea un array JSON de strings para el campo "Tags".
    - Debe incluir: "Fe en 10 Minutos", "Oración de 10 minutos", "Oración Poderosa", "${theme}", "Oración Diaria", "Oración Guiada", "Intimidad con Dios", "Oración de la Noche", "Oración para Dormir", "Palabra de Dios", "Mensaje de Fe", "Devocional Diario".
    `};

    const prompt = prompts[language] || prompts['en'];

    try {
        const response = await ai.models.generateContent({
            model,
            contents: [{ parts: [{ text: prompt }] }],
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        title: { type: Type.STRING },
                        description: { type: Type.STRING },
                        hashtags: {
                            type: Type.ARRAY,
                            items: { type: Type.STRING },
                        },
                        timestamps: { type: Type.STRING },
                        tags: {
                            type: Type.ARRAY,
                            items: { type: Type.STRING },
                        },
                    },
                    required: ["title", "description", "hashtags", "timestamps", "tags"],
                },
            },
        });
        
        const jsonStr = response.text.trim();
        return JSON.parse(jsonStr) as YouTubeLongPost;

    } catch (error) {
        console.error("Error generating YouTube long post:", error);
        throw new Error("Failed to generate YouTube long post.");
    }
};


export const generateSpeech = async (text: string, multiSpeakerConfig?: MultiSpeakerConfig): Promise<string> => {
    const model = 'gemini-2.5-flash-preview-tts';
    
    let speechConfig: any;
    let textToSynthesize: string;

    if (multiSpeakerConfig && multiSpeakerConfig.speakers.length > 1) {
        const speakerNames = multiSpeakerConfig.speakers.map(s => s.name).join(' and ');
        // Add an instructional preamble, as shown in documentation examples,
        // to guide the model for multi-speaker synthesis.
        textToSynthesize = `TTS the following dialogue between ${speakerNames}:\n\n${text}`;

        speechConfig = {
            multiSpeakerVoiceConfig: {
                speakerVoiceConfigs: multiSpeakerConfig.speakers.map(speaker => ({
                    speaker: speaker.name,
                    voiceConfig: {
                        prebuiltVoiceConfig: { voiceName: speaker.voice }
                    }
                }))
            }
        };
    } else {
        // Add a simple instructional preamble for single-speaker synthesis.
        textToSynthesize = `Read the following prayer aloud in a reverent and peaceful voice:\n\n${text}`;
        speechConfig = {
            voiceConfig: {
                prebuiltVoiceConfig: { voiceName: 'Kore' }, // Default single voice
            },
        };
    }

    try {
        const response = await ai.models.generateContent({
            model,
            contents: [{ parts: [{ text: textToSynthesize }] }],
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig,
            },
        });
        const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (!base64Audio) {
            throw new Error("No audio data returned from API.");
        }
        return base64Audio;
    } catch (error) {
        console.error("Error generating speech:", error);
        throw error;
    }
};

export const generateImageFromPrayer = async (prompt: string, aspectRatio: AspectRatio, modelName: string = 'imagen-4.0-generate-001'): Promise<string> => {
    try {
        const response = await ai.models.generateImages({
            model: modelName,
            prompt,
            config: {
              numberOfImages: 1,
              outputMimeType: 'image/png',
              aspectRatio: aspectRatio,
            },
        });
        const base64Image = response.generatedImages[0].image.imageBytes;
        if (!base64Image) {
            throw new Error("No image data returned from API.");
        }
        return base64Image;
    } catch (error) {
        console.error("Error generating image:", error);
        throw error;
    }
};

export const generateVideo = async (prompt: string, aspectRatio: AspectRatio): Promise<string> => {
    const videoAI = new GoogleGenAI({ apiKey: process.env.API_KEY });
    let operation: GenerateVideosOperation = await videoAI.models.generateVideos({
        model: 'veo-3.1-fast-generate-preview',
        prompt,
        config: {
            numberOfVideos: 1,
            resolution: '720p',
            aspectRatio: aspectRatio,
        }
    });

    while (!operation.done) {
        await new Promise(resolve => setTimeout(resolve, 10000));
        operation = await videoAI.operations.getVideosOperation({ operation: operation });
    }

    const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
    if (!downloadLink) {
        throw new Error("Video generation completed but no download link was found.");
    }
    
    return downloadLink;
};