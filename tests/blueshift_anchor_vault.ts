import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { BlueshiftAnchorVault } from "../target/types/blueshift_anchor_vault";
import { Keypair, PublicKey, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { expect } from "chai";

describe("blueshift_anchor_vault", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.BlueshiftAnchorVault as Program<BlueshiftAnchorVault>;
  let signer: Keypair;
  let vaultPda: PublicKey;
  let bump: number;
  let extraSeed: Keypair;

  beforeEach(async () => {
    // Generate a new signer and extraSeed for each test
    signer = Keypair.generate();
    extraSeed = Keypair.generate();

    // Derive the PDA for the vault using the new signer and extraSeed
    [vaultPda, bump] = PublicKey.findProgramAddressSync(
      [Buffer.from("anchor_vault"), signer.publicKey.toBuffer(), extraSeed.publicKey.toBuffer()],
      program.programId
    );

    // Fund the signer with SOL for transaction fees and deposits
    const airdropSig = await provider.connection.requestAirdrop(signer.publicKey, 2 * LAMPORTS_PER_SOL);
    await provider.connection.confirmTransaction(airdropSig, "confirmed");
  });

  it("Deposits lamports successfully", async () => {
    const amount = new anchor.BN(0.01 * LAMPORTS_PER_SOL);

    // Check signer's initial balance
    const balance = await provider.connection.getBalance(signer.publicKey);
    expect(balance).to.be.gte(amount.toNumber());

    // Perform the deposit
    const tx = await program.methods.deposit(amount)
      .accounts({
        signer: signer.publicKey,
        vault: vaultPda,
        extraSeed: extraSeed.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([signer])
      .rpc({ commitment: "confirmed" });

    console.log("Deposit transaction signature:", tx);

    // Check vault balance after deposit
    const vaultBalance = await provider.connection.getBalance(vaultPda);
    expect(vaultBalance).to.be.gte(amount.toNumber());
    console.log("Vault balance after deposit:", vaultBalance);
  });

  it("Withdraws funds successfully", async () => {
    // First, deposit funds so there's something to withdraw
    const amount = new anchor.BN(0.01 * LAMPORTS_PER_SOL);
    await program.methods.deposit(amount)
      .accounts({
        signer: signer.publicKey,
        vault: vaultPda,
        extraSeed: extraSeed.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([signer])
      .rpc({ commitment: "confirmed" });

    // Check signer's balance before withdrawal
    const preBalance = await provider.connection.getBalance(signer.publicKey);

    // Perform the withdrawal
    const tx = await program.methods.withdraw()
      .accounts({
        signer: signer.publicKey,
        vault: vaultPda,
        extraSeed: extraSeed.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([signer])
      .rpc({ commitment: "confirmed" });

    console.log("Withdraw transaction signature:", tx);

    // Check balances after withdrawal
    const postBalance = await provider.connection.getBalance(signer.publicKey);
    const vaultBalance = await provider.connection.getBalance(vaultPda);

    expect(postBalance).to.be.gte(preBalance); // Should increase by at least the deposit minus fees
    expect(vaultBalance).to.equal(0); // Vault should be emptied or closed
    console.log("Signer balance after withdraw:", postBalance);
    console.log("Vault balance after withdraw:", vaultBalance);
  });
});
