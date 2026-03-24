export default {
  async fetch(request, env) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "application/json"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method !== "POST") {
      return new Response(JSON.stringify({ ok: false, error: "Method not allowed" }), {
        status: 405,
        headers: corsHeaders
      });
    }

    try {
      const body = await request.json();
      const email = (body.email || "").trim();

      if (!email) {
        return new Response(JSON.stringify({ ok: false, error: "Email is required" }), {
          status: 400,
          headers: corsHeaders
        });
      }

      const authHeaders = {
        "Authorization": `Klaviyo-API-Key ${env.KLAVIYO_PRIVATE_API_KEY}`,
        "accept": "application/vnd.api+json",
        "content-type": "application/vnd.api+json",
        "revision": env.KLAVIYO_REVISION || "2025-01-15"
      };

      // 1) Create/update profile
      const profilePayload = {
        data: {
          type: "profile-bulk-import-job",
          attributes: {
            profiles: {
              data: [
                {
                  type: "profile",
                  attributes: {
                    email,
                    first_name: body.firstName || undefined,
                    last_name: body.lastName || undefined,
                    phone_number: body.phone || undefined,
                    properties: {
                      form_type: "Dealer enquiry",
                      business_name: body.businessName || "",
                      business_location: body.businessLocation || "",
                      business_type: body.businessType || "",
                      brands_of_interest: body.brandsOfInterest || "",
                      website: body.website || "",
                      abn_or_business_registration: body.abn || "",
                      dealer_consent: body.dealerConsent ? "Yes" : "No",
                      dealer_message: body.message || "",
                      source_url: body.sourceUrl || "",
                      submitted_at: new Date().toISOString()
                    }
                  }
                }
              ]
            }
          }
        }
      };

      const importRes = await fetch("https://a.klaviyo.com/api/profile-import", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify(profilePayload)
      });

      const importBody = await importRes.text();

      if (!importRes.ok) {
        return new Response(JSON.stringify({
          ok: false,
          step: "profile-import",
          status: importRes.status,
          body: importBody
        }), {
          status: 502,
          headers: corsHeaders
        });
      }

      // 2) Add to list without changing marketing consent
      const listPayload = {
        data: [
          {
            type: "profile",
            attributes: {
              email
            }
          }
        ]
      };

      const listRes = await fetch(
        `https://a.klaviyo.com/api/lists/${env.KLAVIYO_LIST_ID}/relationships/profiles`,
        {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify(listPayload)
        }
      );

      const listBody = await listRes.text();

      if (!listRes.ok) {
        return new Response(JSON.stringify({
          ok: false,
          step: "add-to-list",
          status: listRes.status,
          body: listBody
        }), {
          status: 502,
          headers: corsHeaders
        });
      }

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: corsHeaders
      });
    } catch (error) {
      return new Response(JSON.stringify({
        ok: false,
        error: error.message || "Unknown error"
      }), {
        status: 500,
        headers: corsHeaders
      });
    }
  }
};