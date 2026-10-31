// scripts/setup-logto.ts
// Logto M2M automated setup script for GwenVenni B2B Order & RFQ System

import 'dotenv/config';

async function setupLogto() {
  const endpoint = process.env.LOGTO_ENDPOINT?.replace(/\/+$/, '');
  const m2mAppId = process.env.LOGTO_M2M_APP_ID;
  const m2mAppSecret = process.env.LOGTO_M2M_APP_SECRET;
  const adminEmails = (process.env.ADMIN_EMAILS || 'forhaisome@gmail.com')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  console.log('=== Logto Cloud M2M Automation Initializer ===\n');

  if (!endpoint || !m2mAppId || !m2mAppSecret) {
    console.log('⚠️  Logto M2M credentials not fully provided in environment:');
    console.log(`   - LOGTO_ENDPOINT: ${endpoint ? '✓ Configured' : '✗ Missing (e.g. https://your-tenant.logto.app)'}`);
    console.log(`   - LOGTO_M2M_APP_ID: ${m2mAppId ? '✓ Configured' : '✗ Missing'}`);
    console.log(`   - LOGTO_M2M_APP_SECRET: ${m2mAppSecret ? '✓ Configured' : '✗ Missing'}`);
    console.log('\n📖 How to obtain Logto M2M credentials:');
    console.log('   1. Log into your Logto Console: https://cloud.logto.io/');
    console.log('   2. Go to "Applications" -> "Create Application" -> choose "Machine-to-machine (M2M)"');
    console.log('   3. Assign Logto Management API permissions ("Read & Write") to this M2M application');
    console.log('   4. Add LOGTO_ENDPOINT, LOGTO_M2M_APP_ID, and LOGTO_M2M_APP_SECRET to your .env file');
    console.log('   5. Re-run: npx tsx scripts/setup-logto.ts\n');
    console.log('💡 Note: The system currently includes an automatic local simulated auth & admin email whitelist fallback');
    console.log(`   (Admin whitelist: ${adminEmails.join(', ')}), so order management is immediately testable!\n`);
    return;
  }

  try {
    console.log(`1. Requesting Management API token from ${endpoint}/oidc/token...`);
    const tokenParams = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: m2mAppId,
      client_secret: m2mAppSecret,
      resource: `${endpoint}/api`,
      scope: 'all',
    });

    const tokenRes = await fetch(`${endpoint}/oidc/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenParams.toString(),
      signal: AbortSignal.timeout(6000),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      throw new Error(`Failed to obtain M2M access token: ${tokenRes.status} ${errText}`);
    }

    const { access_token } = await tokenRes.json();
    console.log('✓ Successfully authenticated with Logto Management API!\n');

    const headers = {
      Authorization: `Bearer ${access_token}`,
      'Content-Type': 'application/json',
    };

    // 2. Check or create Traditional Web Application
    console.log('2. Verifying GwenVenni B2B Web Application...');
    const appsRes = await fetch(`${endpoint}/api/applications`, {
      headers,
      signal: AbortSignal.timeout(6000),
    });
    const apps = await appsRes.json();
    let targetApp = Array.isArray(apps) ? apps.find((a: any) => a.name === 'GwenVenni B2B Web') : null;

    const redirectUris = [
      'https://gwenvenni.com/api/auth/callback',
      'http://localhost:3000/api/auth/callback',
      'http://localhost:4321/api/auth/callback',
      'http://127.0.0.1:3000/api/auth/callback',
      'http://127.0.0.1:4321/api/auth/callback',
    ];

    const postLogoutUris = [
      'https://gwenvenni.com/',
      'http://localhost:3000/',
      'http://localhost:4321/',
    ];

    if (!targetApp) {
      console.log('   Creating "GwenVenni B2B Web" Traditional Web App...');
      const createRes = await fetch(`${endpoint}/api/applications`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: 'GwenVenni B2B Web',
          type: 'Traditional',
          oidcClientMetadata: {
            redirectUris,
            postLogoutRedirectUris: postLogoutUris,
          },
        }),
        signal: AbortSignal.timeout(6000),
      });

      if (!createRes.ok) {
        throw new Error(`Failed to create application: ${await createRes.text()}`);
      }
      targetApp = await createRes.json();
      console.log(`   ✓ Created application ID: ${targetApp.id}`);
    } else {
      console.log(`   ✓ Found existing application ID: ${targetApp.id}`);
      // Ensure redirect URIs are up to date
      const existingRedirects = targetApp.oidcClientMetadata?.redirectUris || [];
      const mergedRedirects = Array.from(new Set([...existingRedirects, ...redirectUris]));
      await fetch(`${endpoint}/api/applications/${targetApp.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          oidcClientMetadata: {
            ...targetApp.oidcClientMetadata,
            redirectUris: mergedRedirects,
            postLogoutRedirectUris: postLogoutUris,
          },
        }),
        signal: AbortSignal.timeout(6000),
      });
      console.log('   ✓ Synchronized multi-environment redirect URIs');
    }

    // 3. Check or create 'admin' Role
    console.log('\n3. Checking "admin" role definition...');
    const rolesRes = await fetch(`${endpoint}/api/roles`, {
      headers,
      signal: AbortSignal.timeout(6000),
    });
    const roles = await rolesRes.json();
    let adminRole = Array.isArray(roles) ? roles.find((r: any) => r.name === 'admin') : null;

    if (!adminRole) {
      console.log('   Creating "admin" role in Logto...');
      const roleCreateRes = await fetch(`${endpoint}/api/roles`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: 'admin',
          description: 'GwenVenni B2B Atelier Administrator (Order Approval & Shipping Fulfillment)',
        }),
        signal: AbortSignal.timeout(6000),
      });
      adminRole = await roleCreateRes.json();
      console.log(`   ✓ Created role "admin" (ID: ${adminRole.id})`);
    } else {
      console.log(`   ✓ Found existing "admin" role (ID: ${adminRole.id})`);
    }

    // Fetch App Secret
    let appSecretValue = targetApp.secret;
    if (!appSecretValue) {
      try {
        const secRes = await fetch(`${endpoint}/api/applications/${targetApp.id}/secrets`, {
          headers,
          signal: AbortSignal.timeout(6000),
        });
        if (secRes.ok) {
          const secList = await secRes.json();
          if (Array.isArray(secList) && secList.length > 0) {
            appSecretValue = secList[0].value;
          }
        }
      } catch {
        // ignore
      }
    }

    console.log('\n🎉 Logto M2M Initialization Complete!');
    console.log('───────────────────────────────────────────────────');
    console.log(`LOGTO_APP_ID=${targetApp.id}`);
    console.log(`LOGTO_APP_SECRET=${appSecretValue || '<See Logto Console App Secret>'}`);
    console.log('───────────────────────────────────────────────────');
    console.log('You can now add LOGTO_APP_ID and LOGTO_APP_SECRET to your .env or Cloudflare Worker secrets.');
  } catch (err: any) {
    console.error('❌ Logto automation setup error:', err.message);
  }
}

setupLogto();

