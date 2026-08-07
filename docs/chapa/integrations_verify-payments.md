# Chapa Documentation

[Integrations Guides](/integrations/test-mode-vs-live-mode "Integrations Guides")Verify Payment

## Verify Payments[](#verify-payments)

This document will go through the necessary actions taken to verify transactions after payment using Chapa’s API.

### How to Verify Payments[](#how-to-verify-payments)

Verifying payment is dependent on the method used when first initializing a transaction. This request is initiated from your callback URL. Using your transaction reference, a GET request is needed to be made to the Verify Transaction endpoint server.

Here is a sample code for verifying transactions:

**Endpoint** `https://api.chapa.co/v1/transaction/verify/<tx_ref>`

> `<tx_ref>` is the tx\_ref that was set by you when initiating a payment.

**Method** `GET`

-   `Authorization` : Pass your secret key as a bearer token in the request header to authorize this call.

javascript

```
1var myHeaders = new Headers();2  myHeaders.append("Authorization", "Bearer CHASECK_TEST-XXXXXXXXXXXXXXX");34  var raw = "";56  var requestOptions = {7    method: 'GET',8    headers: myHeaders,9    body: raw,10    redirect: 'follow'11  };1213  fetch("https://api.chapa.co/v1/transaction/verify/chewatatest-6669", requestOptions)14    .then(response => response.text())15    .then(result => console.log(result))16    .catch(error => console.log('error', error));
```

### Successful Response

```
1{2  "message": "Payment details",3  "status": "success",4  "data": {5      "first_name": "Bilen",6      "last_name": "Gizachew",7      "email": "abebech_bekele@gmail.com",8      "currency": "ETB",9      "amount": 100,10      "charge": 3.5,11      "mode": "test",12      "method": "test",13      "type": "API",14      "status": "success",15      "reference": "6jnheVKQEmy",16      "tx_ref": "chewatatest-6669",17      "customization": {18          "title": "Payment for my favourite merchant",19          "description": "I love online payments",20          "logo": null21      },22      "meta": null,23      "created_at": "2023-02-02T07:05:23.000000Z",24      "updated_at": "2023-02-02T07:05:23.000000Z"25    }26  }
```

### Failed Response

```
1{2  "message": "Invalid transaction or Transaction not found	",3  "status": "failed",4  "data": null5  }
```

ℹ️

Refer to our [Error Codes](/integrations/responses) page for all responses for this request.

Last updated on March 19, 2025

[Cancel Transaction](/integrations/transaction-cancel "Cancel Transaction")[Split Payments](/integrations/split-payment "Split Payments")