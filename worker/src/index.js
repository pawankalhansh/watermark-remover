/**
 * Cloudflare Worker — AI Watermark Remover Backend
 * Runs Stable Diffusion Inpainting locally on Cloudflare's Edge GPUs (100% Free Tier)
 */

export default {
  async fetch(request, env) {
    // CORS Headers for static GitHub Pages site compatibility
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    // 1. Handle CORS OPTIONS preflight request
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // 2. Reject non-POST requests
    if (request.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Only POST requests are supported." }),
        { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    try {
      // 3. Parse Multipart Form Data
      const formData = await request.formData();
      const imageFile = formData.get("image");
      const maskFile = formData.get("mask");

      if (!imageFile || !maskFile) {
        return new Response(
          JSON.stringify({ error: "Missing required fields: 'image' and 'mask' must be provided." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // 4. Convert Image & Mask Files to Uint8Arrays for Workers AI
      const imageBuffer = await imageFile.arrayBuffer();
      const maskBuffer = await maskFile.arrayBuffer();

      const imageArray = [...new Uint8Array(imageBuffer)];
      const maskArray = [...new Uint8Array(maskBuffer)];

      // 5. Read optional dynamic parameters from form-data (with high-precision defaults)
      const promptParam = formData.get("prompt") || "seamless photo restoration, remove watermark, highly detailed";
      const negativePromptParam = formData.get("negative_prompt") || "watermark, text, letters, words, logo, signature, digits, numbers, blur, distorted, artifacts, deformed, ugly, mutated";
      
      const rawStrength = formData.get("strength");
      const strengthParam = rawStrength ? parseFloat(rawStrength) : 0.45;

      const rawSteps = formData.get("num_steps");
      const stepsParam = rawSteps ? parseInt(rawSteps) : 20;

      // Build AI Model Inputs
      const inputs = {
        prompt: promptParam,
        negative_prompt: negativePromptParam,
        image: imageArray,
        mask: maskArray,
        strength: strengthParam,
        num_steps: stepsParam
      };

      // 6. Run Stable Diffusion Inpainting on Cloudflare GPUs
      const response = await env.AI.run(
        "@cf/runwayml/stable-diffusion-v1-5-inpainting",
        inputs
      );

      // 7. Return clean PNG binary output
      return new Response(response, {
        headers: {
          ...corsHeaders,
          "Content-Type": "image/png",
        },
      });
    } catch (error) {
      return new Response(
        JSON.stringify({ error: error.message || "An error occurred during AI inpainting." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  }
};
