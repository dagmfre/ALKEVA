# Chapa Documentation

[Integrations Guides](/integrations/test-mode-vs-live-mode "Integrations Guides")Webhooks

## Webhooks[](#webhooks)

This document goes through event listeners that can be called when certain actions are performed.

### What are Webhooks[](#what-are-webhooks)

Whenever transactions take place, certain events will be triggered that cooperate with your application. Webhook is a URL on your server that sends these events.

### When to use webhooks[](#when-to-use-webhooks)

Webhooks are supported for all kinds of payment methods, but they’re especially useful for methods and events that happen outside your application’s control, such as:

-   a pending payment transaction to successful.

These are all asynchronous actions—they are not controlled by your application, so you won’t know when they are completed, unless we notify you or you check later.

Setting up a webhook allows us to notify you when these payments are completed. Within your webhook endpoint, you can then:

-   Update your order records when the status of a pending payment id updated to successful.

### Enabling webhooks[](#enabling-webhooks)

Here’s how to setup a webhook on your Chapa account:

1.  Login to your dashboard and go to your profile settings.
2.  Navigate to Webhooks tab to add your webhook URL and secret hash
3.  That’s it!

### Recieving an event[](#recieving-an-event)

A webhook URL is an endpoint on your server where you can receive notifications about such events. When an event occurs, we’ll make a POST request to that endpoint, with a JSON body containing the details about the event, including the type of event and the data associated with it.

#### Example Code[](#example-code)

```
app.post("/my/webhook/url", function(req, res) {
    // Retrieve the request's body
    var event = req.body;
    // Do something with event
     res.send(200);
});
```

### Structure of a webhook payload[](#structure-of-a-webhook-payload)

The payload for your webhook will depend on if it was initiated by a transfer or by a transaction. You can check the difference by the type attribute. Transfer has `"type": "Payout"` while the transaction webhook will have the type of transaction, such as `Payment Link` , `API`, `Event`, `Donation` etc.

Transfer Webhook ResponseTransaction Webhook Response

```
{
  "event": "payout.success",
  "type": "Payout",
  "account_name": "Customer Name",
  "account_number": "25190000000",
  "bank_id": 855,
  "bank_name": "telebirr",
  "amount": "2000.00",
  "charge": "60.00",
  "currency": "ETB",
  "status": "success",
  "reference": "MYMER3434989",
  "chapa_reference": "2o10dfs332U",
  "bank_reference": "GT3412w3",
  "created_at": "2023-08-27T19:23:22.000000Z",
  "updated_at": "2023-08-27T19:23:23.000000Z"
}   
```

```
 
{
"event": "charge.success",
"first_name": "",
"last_name": "",
"email": null,
"mobile": "25190000000",
"currency": "ETB",
"amount": "400.00",
"charge": "12.00",
"status": "success",
"mode": "live",
"reference": "AP634JFwEbxd",
"created_at": "2023-08-27T19:21:18.000000Z",
"updated_at": "2023-08-27T19:21:27.000000Z",
"type": "API",
"tx_ref": "4FGFF4FFGD3",
"payment_method": "telebirr",
"customization": {
  "title": null,
  "description": null,
  "logo": null
},
"meta": null
}
 
 
```

### Webhook Event Types[](#webhook-event-types)

#### Transaction Events[](#transaction-events)

SuccessRefunding or RefundedReversedFailed/Cancelled

```
{
"event": "charge.success",
"first_name": "",
"last_name": "",
"email": null,
"mobile": "25190000000",
"currency": "ETB",
"amount": "400.00",
"charge": "12.00",
"status": "success",
"mode": "live",
"reference": "AP634JFwEbxd",
"created_at": "2023-08-27T19:21:18.000000Z",
"updated_at": "2023-08-27T19:21:27.000000Z",
"type": "API",
"tx_ref": "4FGFF4FFGD3",
"payment_method": "telebirr",
"customization": {
  "title": null,
  "description": null,
  "logo": null
},
"meta": null
} 
```

```
{
"event": "charge.refunded",
"first_name": "",
"last_name": "",
"email": null,
"mobile": "25190000000",
"currency": "ETB",
"amount": "400.00",
"charge": "12.00",
"status": "refunded",
"mode": "live",
"reference": "AP634JFwEbxd",
"created_at": "2023-08-27T19:21:18.000000Z",
"updated_at": "2023-08-27T19:21:27.000000Z",
"type": "API",
"tx_ref": "4FGFF4FFGD3",
"payment_method": "telebirr",
"customization": {
  "title": null,
  "description": null,
  "logo": null
},
"meta": null
}
```

```
{
"event": "charge.reversed",
"first_name": "",
"last_name": "",
"email": null,
"mobile": "25190000000",
"currency": "ETB",
"amount": "400.00",
"charge": "12.00",
"status": "reversed",
"mode": "live",
"reference": "AP634JFwEbxd",
"created_at": "2023-08-27T19:21:18.000000Z",
"updated_at": "2023-08-27T19:21:27.000000Z",
"type": "API",
"tx_ref": "4FGFF4FFGD3",
"payment_method": "telebirr",
"customization": {
  "title": null,
  "description": null,
  "logo": null
},
"meta": null
}
```

```
{
"event": "charge.failed/cancelled",
"first_name": "",
"last_name": "",
"email": null,
"mobile": "25190000000",
"currency": "ETB",
"amount": "400.00",
"charge": "12.00",
"status": "failed/cancelled",
"mode": "live",
"reference": "AP634JFwEbxd",
"failure_reason": "USSD Push service, the user has not entered the PIN for an extended period, causing the service to time out.",
"created_at": "2023-08-27T19:21:18.000000Z",
"updated_at": "2023-08-27T19:21:27.000000Z",
"type": "API",
"tx_ref": "4FGFF4FFGD3",
"payment_method": "telebirr",
"customization": {
  "title": null,
  "description": null,
  "logo": null
},
"meta": null
}
```

#### Transfer Events[](#transfer-events)

SuccessFailed/Cancelled

```
{
  "event": "payout.success",
  "type": "Payout",
  "account_name": "Customer Name",
  "account_number": "25190000000",
  "bank_id": 855,
  "bank_name": "telebirr",
  "amount": "2000.00",
  "charge": "60.00",
  "currency": "ETB",
  "status": "success",
  "reference": "MYMER3434989",
  "chapa_reference": "2o10dfs332U",
  "bank_reference": "GT3412w3",
  "created_at": "2023-08-27T19:23:22.000000Z",
  "updated_at": "2023-08-27T19:23:23.000000Z"
}     
```

```
{
  "event": "payout.failed/cancelled",
  "type": "Payout",
  "account_name": "Customer Name",
  "account_number": "25190000000",
  "bank_id": 855,
  "bank_name": "telebirr",
  "amount": "2000.00",
  "charge": "60.00",
  "currency": "ETB",
  "status": "failed/cancelled",
  "reference": "MYMER3434989",
  "chapa_reference": "2o10dfs332U",
  "bank_reference": "GT3412w3",
  "created_at": "2023-08-27T19:23:22.000000Z",
  "updated_at": "2023-08-27T19:23:23.000000Z"
}   
```

### Verify webhook origin[](#verify-webhook-origin)

When enabling webhooks, you should set a secret hash. Since webhook URLs are publicly accessible, the secret hash allows you to verify that incoming requests are from Chapa. You can specify any string value as your secret hash, but we recommend something random. You should also store it as an environment variable on your server.

We will include it in our request to your `webhook URL`, in a header called `chapa-signature`.

The value of `chapa-signature` header is a `HMAC SHA256` signature of your secret key signed using your secret key.

The value of `x-chapa-signature` header is a `HMAC SHA256` signature of the event payload signed using your secret key.

Also we will include another header `x-chapa-signature`.

In the webhook endpoint, check if either the `chapa-signatur`e or `x-chapa-signature` header is present and verify that its value matches the expected hash. If either header is missing or the value does not match, discard the request, as it is not from Chapa. If both headers are present but one of the headers is valid, it is sufficient to proceed.

Verifying either `x-chapa-signature` or `chapa-signature` header should be done before processing the event.

#### Example Code[](#example-code-1)

```
var crypto = require('crypto');
var secret = process.env.SECRET_KEY;
// Using Express
app.post("/my/webhook/url", function(req, res) {
    //validate event
    const hash = crypto.createHmac('sha256', secret).update(JSON.stringify(req.body)).digest('hex');
    if (hash == req.headers['x-chapa-signature']) {
    // Retrieve the request's body
    const event = req.body;
    // Do something with event  
    }
    res.send(200);
});
```

### Best Practices for Implementing Webhooks[](#best-practices-for-implementing-webhooks)

#### Always Verify Critical Transaction Data[](#always-verify-critical-transaction-data)

Before giving value to a customer based on a webhook notification, always re-query our API to verify the transaction details. This helps confirm that the data returned is consistent with what you’re expecting and has not been compromised.

For example, when you receive a successful payment notification, call the transaction verification endpoint to confirm that the status, amount, currency, tx\_ref and mode match the expected value in your system before confirming the customer’s order.

#### Be Idempotent[](#be-idempotent)

In some cases, the same webhook event may be delivered more than once—usually due to network delays, timeouts, or retries when your server doesn’t respond with a 200 OK. To prevent duplicate actions (such as crediting a customer multiple times), your webhook processing must be idempotent.

This means that handling the same event multiple times should always produce the same outcome. If your system has already processed that event, simply acknowledge it without repeating any business logic.

### Custom Webhooks[](#custom-webhooks)

Custom webhooks can be enabled upon request. Unlike our standard webhooks, they offer more flexibility in authentication and the types of events you can subscribe to.

Once enabled, you can configure your custom webhook from the Chapa dashboard by clicking the “Add New Webhook” button.

![Custom Webhook Location](/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Fcustom-webhook.670fe6a5.jpg&w=3840&q=75)

Basic AuthChapa Signature

ℹ️

For Basic Auth, you will need to provide a username, password, webhook URL, webhook secret and webhook type.

![Custom Webhook with Basic Auth](/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Fconfigure_custom_webhook.cfcf9fbe.png&w=3840&q=75)

ℹ️

For Chapa Signature, you will need to provide a webhook URL, webhook secret and webhook type.

![Custom Webhook with Chapa Signature](/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Fsignature_custom_webhook.3efb13bb.png&w=3840&q=75)

#### Authentication Types[](#authentication-types)

You can choose from two authentication methods for your custom webhooks:

-   **Basic Auth**: This method uses a simple username and password for authentication. Chapa will include these credentials in the `Authorization` header of the webhook request.
    
-   **Signature**: This method works similarly to our standard webhooks. You provide a secret key, and Chapa will use it to create a `HMAC SHA256` signature of the webhook payload. This signature will be sent in the `chapa-signature` header, allowing you to verify the request’s authenticity.
    

#### Webhook Types[](#webhook-types)

Custom webhooks allow you to subscribe to specific event categories. The available types are:

-   **Payout**: Notifies you about events related to payouts made from your Chapa account.
-   **Transaction**: Informs you about payment made to you via Chapa.
-   **Refund**: Sends notifications for refund events, such as when a refund is processed.

### Acknowledging Webhook Event[](#acknowledging-webhook-event)

When your webhook URL receives an event, it needs to parse and acknowledge the event. Acknowledging an event means returning a `200 OK` in the HTTP header. Without a `200 OK` in the response header, we’ll keep sending events every 10 minutes for up to 10 attempts over a 72-hour period.

Last updated on July 8, 2026

[HTML Checkout](/integrations/html-checkout "HTML Checkout")[SDK and Plugins](/integrations/sdk-plugins "SDK and Plugins")