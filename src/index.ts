import { Contract, WalletConnection, connect, keyStores } from "near-api-js";
import type { ConnectConfig } from "near-api-js";

const config: ConnectConfig = {
  nodeUrl: "https://rpc.testnet.near.org",
  walletUrl: "https://wallet.testnet.near.org",
  helperUrl: "https://helper.testnet.near.org",
  deps: {
    keyStore: new keyStores.BrowserLocalStorageKeyStore(),
  },
  networkId: "",
  headers: {},
};

type MarketsValue = { ticker: string; decimal: number; address: string };
type Markets = {
  id: number;
  base: MarketsValue;
  fee: number;
  quote: MarketsValue;
}[];
type Order = {
  price: number;
  quantity: number;
};
type Market = {
  ask_orders: Order[];
  bid_orders: Order[];
};

const signInButton = document.getElementById("signin")!;
const signOutButton = document.getElementById("signout")!;
const app = document.getElementById("app")!;
const select = document.getElementById("markets")!;
const table = document.getElementById("table")!;
const bidOrdersEl = document.getElementById("bid-orders")!;
const askOrdersEl = document.getElementById("ask-orders")!;
const diffEl = document.getElementById("diff")!;
const totalEl = document.getElementById("total")!;

const enum Methods {
  markets = "markets",
  viewMarket = "view_market",
}

const methods = [Methods.markets, Methods.viewMarket];

const ex = 10e23;

const createDiv = (text?: string) => {
  const div = document.createElement("div");
  if (typeof text === "string") {
    div.innerText = text;
  }

  return div;
};
const createP = (text: string) => {
  const p = document.createElement("p");
  p.innerText = text;
  return p;
};

(async () => {
  const near = await connect(config);

  const wallet = new WalletConnection(near, null);

  signOutButton.onclick = () => {
    wallet.signOut();
    signInButton.style.display = "flex";
    signOutButton.style.display = "none";
    table.style.display = "none";
    select.style.display = "none";
    const option = document.createElement("option");
    option.innerText = "select market";
    option.toggleAttribute("hidden");
    option.toggleAttribute("disabled");
    option.toggleAttribute("selected");
    option.toggleAttribute("value");
    select.replaceChildren(option);
    app.replaceChildren();
    bidOrdersEl.replaceChildren();
    askOrdersEl.replaceChildren();
    diffEl.innerText = "";
    totalEl.innerText = "";
  };

  const onSignIn = async () => {
    signInButton.style.display = "none";
    signOutButton.style.display = "flex";

    const accountId = wallet.getAccountId();
    const pAccountId = createP(`account id: ${accountId}`);
    app.append(pAccountId);

    const account = wallet.account();
    const balance = await account.getAccountBalance();
    const total = (Number.parseInt(balance.total) / ex).toFixed(5);
    const available = (Number.parseInt(balance.available) / ex).toFixed(5);
    const pTotal = createP(`available balance: ${available}`);
    const pAvailable = createP(`total balance: ${total}`);
    app.append(pTotal, pAvailable);

    const contract = new Contract(account, "app_2.spin_swap.testnet", {
      viewMethods: methods,
      changeMethods: [],
    });

    const markets = await (contract as any)[Methods.markets]({});

    for (const market of markets as Markets) {
      const option = document.createElement("option");
      option.value = market.id.toString();
      option.innerText = `${market.base.ticker} / ${market.quote.ticker}`;
      select.append(option);
    }

    select.style.display = "flex";

    select.onchange = async (e) => {
      const value = (e.target as HTMLSelectElement).value;
      const market_id = parseInt(value);
      const res: Market = await (contract as any)[Methods.viewMarket]({
        market_id,
      });

      table.style.display = "flex";

      const ask_orders = res.ask_orders.map((order: Order) => ({
        price: BigInt(order.price),
        quantity: BigInt(order.quantity),
      }));
      const bid_orders = res.bid_orders.map((order: Order) => ({
        price: BigInt(order.price),
        quantity: BigInt(order.quantity),
      }));

      const convert = (n: bigint) => Number(n / BigInt(10e19)) / 4;

      let maxAsk: number | null = null;
      let minBid: number | null = null;

      const map = (
        orders: { price: bigint; quantity: bigint }[],
        cb: (price: number) => void,
      ): HTMLDivElement[] => {
        return orders
          .sort((a, b) => Number(b.price - a.price))
          .map((order) => {
            const el = createDiv();
            el.className = "row";
            const priceVal = convert(order.price);
            cb(priceVal);
            const price = createDiv(priceVal.toFixed(4));
            price.className = "cell price";

            const sizeVal = convert(order.quantity);
            const size = createDiv(sizeVal.toFixed(4));
            size.className = "cell size";

            const totalVal = priceVal * sizeVal;
            const total = createDiv(totalVal.toFixed(2));
            total.className = "cell total";

            el.append(price, size, total);
            return el;
          });
      };

      const bid = map(bid_orders, (price) => {
        minBid = price;
      });
      const ask = map(ask_orders, (price) => {
        if (maxAsk === null) {
          maxAsk = price;
        }
      });
      const spread = minBid! - maxAsk!;
      diffEl.innerText = spread.toFixed(4);
      const percent = spread / minBid!;
      totalEl.innerText = percent.toFixed(2) + "%";
      bidOrdersEl.replaceChildren(...bid);
      askOrdersEl.replaceChildren(...ask);
    };
  };

  signInButton.onclick = async () => {
    await wallet.requestSignIn({
      successUrl: "http://localhost:1234",
      failureUrl: "http://localhost:1234",
      contractId: "app_2.spin_swap.testnet",
      methodNames: methods,
    });
    onSignIn();
  };

  if (wallet.isSignedIn()) {
    onSignIn();
  }
})();
