<script>
    import { registerUser } from "../api.js";

    // We receive the user's public key from the main App
    export let publicKey = "";
    // Function to call when registration succeeds (to close the modal or switch views)
    export let onSignupSuccess;

    let email = "";
    let password = "";
    let confirmPassword = "";
    let isLoading = false;
    let errorMessage = "";
    let successMessage = "";

    async function handleRegister() {
        errorMessage = "";
        successMessage = "";

        // 1. Basic Validation
        if (!email || !password) {
            errorMessage = "Please fill in all fields.";
            return;
        }
        if (password !== confirmPassword) {
            errorMessage = "Passwords do not match.";
            return;
        }
        if (!publicKey) {
            errorMessage =
                "Error: Public Key not found. Please regenerate your key.";
            return;
        }

        // 2. Send to Tokyo Server
        isLoading = true;
        try {
            const result = await registerUser(email, password, publicKey);

            // 3. Success!
            successMessage = `Account created! Your IP: ${result.ip}`;
            // Wait 1.5 seconds then notify the parent app
            setTimeout(() => {
                if (onSignupSuccess) onSignupSuccess();
            }, 1500);
        } catch (err) {
            errorMessage = err.message || "Registration failed. Try again.";
        } finally {
            isLoading = false;
        }
    }
</script>

<div class="signup-container">
    <h2>Create Account</h2>

    {#if errorMessage}
        <div class="error">{errorMessage}</div>
    {/if}

    {#if successMessage}
        <div class="success">{successMessage}</div>
    {:else}
        <div class="input-group">
            <label for="email">Email</label>
            <input
                type="email"
                id="email"
                bind:value={email}
                placeholder="you@example.com"
            />
        </div>

        <div class="input-group">
            <label for="pass">Password</label>
            <input
                type="password"
                id="pass"
                bind:value={password}
                placeholder="••••••••"
            />
        </div>

        <div class="input-group">
            <label for="confirm">Confirm Password</label>
            <input
                type="password"
                id="confirm"
                bind:value={confirmPassword}
                placeholder="••••••••"
            />
        </div>

        <button on:click={handleRegister} disabled={isLoading}>
            {#if isLoading}
                Creating Account...
            {:else}
                Sign Up
            {/if}
        </button>
    {/if}
</div>

<style>
    .signup-container {
        background: #1a1a1a;
        padding: 2rem;
        border-radius: 12px;
        width: 100%;
        max-width: 400px;
        margin: 0 auto;
        color: white;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
    }
    h2 {
        margin-top: 0;
        text-align: center;
    }
    .input-group {
        margin-bottom: 1rem;
        text-align: left;
    }
    label {
        display: block;
        font-size: 0.9rem;
        margin-bottom: 0.5rem;
        color: #aaa;
    }
    input {
        width: 100%;
        padding: 0.8rem;
        border-radius: 6px;
        border: 1px solid #333;
        background: #2a2a2a;
        color: white;
        box-sizing: border-box;
    }
    input:focus {
        border-color: #4caf50;
        outline: none;
    }
    button {
        width: 100%;
        padding: 1rem;
        background: #4caf50;
        color: white;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-weight: bold;
        font-size: 1rem;
        margin-top: 1rem;
    }
    button:disabled {
        background: #555;
        cursor: not-allowed;
    }
    .error {
        color: #ff6b6b;
        background: rgba(255, 107, 107, 0.1);
        padding: 0.8rem;
        border-radius: 4px;
        margin-bottom: 1rem;
        text-align: center;
    }
    .success {
        color: #4caf50;
        background: rgba(76, 175, 80, 0.1);
        padding: 0.8rem;
        border-radius: 4px;
        margin-bottom: 1rem;
        text-align: center;
    }
</style>
