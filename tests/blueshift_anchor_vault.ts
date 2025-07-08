import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { BlueshiftAnchorVault } from "../target/types/blueshift_anchor_vault";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
  Transaction,
} from "@solana/web3.js";
import { expect } from "chai";
import * as fs from "fs";

// Helper to load a keypair from a file
function loadKeypairFromFile(filePath: string): Keypair {
  const secretKeyString = fs.readFileSync(filePath, "utf8");
  const secretKey = Uint8Array.from(JSON.parse(secretKeyString));
  return Keypair.fromSecretKey(secretKey);
}

describe("blueshift_anchor_vault (SystemAccount PDA, CPI withdraw)", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.BlueshiftAnchorVault as Program<BlueshiftAnchorVault>;

  let signer: Keypair;
  let vaultPda: PublicKey;
  let bump: number;

  beforeEach(async () => {
    signer = Keypair.generate();

    // Load your default wallet and fund the signer
    const defaultWallet = loadKeypairFromFile("/Users/amalnathsathyan/.config/solana/id.json");
    const requestedLamports = 0.5 * LAMPORTS_PER_SOL;
    const defaultWalletBalance = await provider.connection.getBalance(defaultWallet.publicKey);
    const transferLamports = Math.min(requestedLamports, defaultWalletBalance - 5000);
    if (transferLamports <= 0) {
      throw new Error(`Default wallet has insufficient funds: ${defaultWalletBalance} lamports`);
    }

    const transferTx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: defaultWallet.publicKey,
        toPubkey: signer.publicKey,
        lamports: transferLamports,
      })
    );
    let sig: string;
    try {
      sig = await provider.connection.sendTransaction(
        transferTx,
        [defaultWallet],
        { skipPreflight: false, preflightCommitment: "confirmed" }
      );
      await provider.connection.confirmTransaction(sig, "confirmed");
      console.log("Funding transaction signature:", sig);
    } catch (err) {
      throw new Error(`Funding transaction failed: ${err}`);
    }

    // Wait for balance update
    await new Promise(res => setTimeout(res, 1000));
    const balance = await provider.connection.getBalance(signer.publicKey);
    console.log("Signer balance after funding:", balance);
    if (balance < transferLamports) {
      throw new Error(`Signer not funded: balance is ${balance}`);
    }

    // Derive the vault PDA
    [vaultPda, bump] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), signer.publicKey.toBuffer()],
      program.programId
    );

    // Create the vault system account externally (owned by SystemProgram)
    const vaultLamports = await provider.connection.getMinimumBalanceForRentExemption(0) + 1_000_000;
    const createVaultIx = SystemProgram.createAccount({
      fromPubkey: signer.publicKey,
      newAccountPubkey: vaultPda,
      lamports: vaultLamports,
      space: 0,
      programId: SystemProgram.programId,
    });

    // Only create the account if it doesn't exist
    const vaultInfo = await provider.connection.getAccountInfo(vaultPda);
    if (!vaultInfo) {
      const tx = new Transaction().add(createVaultIx);
      try {
        await provider.sendAndConfirm(tx, [signer]);
      } catch (e) {
        // On devnet/mainnet, you cannot create a PDA-owned SystemAccount directly from the client.
        // On localnet, this works.
        console.warn("Vault PDA creation failed (expected on devnet/mainnet):", e);
      }
    }
  });

  it("Deposits lamports successfully", async () => {
    const amount = new anchor.BN(0.01 * LAMPORTS_PER_SOL);

    // Check signer's initial balance
    const balance = await provider.connection.getBalance(signer.publicKey);
    console.log("Signer balance before deposit:", balance);
    expect(balance).to.be.gte(amount.toNumber());

    // Perform the deposit
    const tx = await program.methods.deposit(amount)
      .accounts({
        signer: signer.publicKey,
        vault: vaultPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([signer])
      .rpc({ commitment: "confirmed" });

    console.log("Deposit transaction signature:", tx);

    // Check vault balance after deposit
    const vaultBalance = await provider.connection.getBalance(vaultPda);
    console.log("Vault balance after deposit:", vaultBalance);
    expect(vaultBalance).to.be.gte(amount.toNumber());
  });

  it("Withdraws funds successfully", async () => {
    const amount = new anchor.BN(0.01 * LAMPORTS_PER_SOL);

    // Deposit first
    await program.methods.deposit(amount)
      .accounts({
        signer: signer.publicKey,
        vault: vaultPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([signer])
      .rpc({ commitment: "confirmed" });

    const preBalance = await provider.connection.getBalance(signer.publicKey);

    // Withdraw all lamports (as per your Rust logic)
    const withdrawTx = await program.methods.withdraw()
      .accounts({
        signer: signer.publicKey,
        vault: vaultPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([signer])
      .rpc({ commitment: "confirmed" });

    console.log("Withdraw transaction signature:", withdrawTx);

    // Check balances after withdrawal
    const postBalance = await provider.connection.getBalance(signer.publicKey);
    const vaultBalance = await provider.connection.getBalance(vaultPda);

    console.log("Signer balance after withdraw:", postBalance);
    console.log("Vault balance after withdraw:", vaultBalance);

    expect(postBalance).to.be.gte(preBalance);
    expect(vaultBalance).to.be.lte(1_000_000); // should be near rent-exempt minimum
  });
});
