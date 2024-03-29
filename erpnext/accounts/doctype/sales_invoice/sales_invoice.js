// Copyright (c) 2015, Frappe Technologies Pvt. Ltd. and Contributors
// License: GNU General Public License v3. See license.txt

{% include 'erpnext/selling/sales_common_custom.js' %};
frappe.provide("erpnext.accounts");


erpnext.accounts.SalesInvoiceController = class SalesInvoiceController extends erpnext.selling.SellingController {
	setup(doc) {
		this.setup_posting_date_time_check();
		super.setup(doc);

	}
	company() {
		erpnext.accounts.dimensions.update_dimension(this.frm, this.frm.doctype);

		let me = this;
		if (this.frm.doc.company) {
			frappe.call({
				method:
					"erpnext.accounts.party.get_party_account",
				args: {
					party_type: 'Customer',
					party: this.frm.doc.customer,
					company: this.frm.doc.company
				},
				callback: (response) => {
					if (response) me.frm.set_value("debit_to", response.message);
				},
			});
		}
	}
	onload() {
		var me = this;
		super.onload();

		this.frm.ignore_doctypes_on_cancel_all = ['POS Invoice', 'Timesheet', 'POS Invoice Merge Log',
			'POS Closing Entry', 'Journal Entry', 'Payment Entry'];

		if(!this.frm.doc.__islocal && !this.frm.doc.customer && this.frm.doc.debit_to) {
			// show debit_to in print format
			this.frm.set_df_property("debit_to", "print_hide", 0);
		}

		erpnext.queries.setup_queries(this.frm, "Warehouse", function() {
			return erpnext.queries.warehouse(me.frm.doc);
		});

		if(this.frm.doc.__islocal && this.frm.doc.is_pos) {
			//Load pos profile data on the invoice if the default value of Is POS is 1

			me.frm.script_manager.trigger("is_pos");
			me.frm.refresh_fields();
		}
		erpnext.queries.setup_warehouse_query(this.frm);

		// load the default user warehouse

		// update the invoice
		calculate_total_amount(cur_frm)
	}

	refresh(doc, dt, dn) {
		const me = this;
		super.refresh();
		if(cur_frm.msgbox && cur_frm.msgbox.$wrapper.is(":visible")) {
			// hide new msgbox
			cur_frm.msgbox.hide();
		}

		this.frm.toggle_reqd("due_date", !this.frm.doc.is_return);

		if (this.frm.doc.is_return) {
			this.frm.return_print_format = "Sales Invoice Return";
		}

		this.show_general_ledger();

		if(doc.update_stock) this.show_stock_ledger();


		// custom code 
		cur_frm.add_custom_button(__('New Invoice'), () => {new_sales_invoice()})
		
		// set user defaults
		frappe.call({
			"method": "feeds.custom_methods.sales_invoice.get_user_defaults",
			"args": {
				"user": frappe.session.user
			},
			callback: function(res) {
				if(res.message.default_warehouse.status){
					cur_frm.set_value("set_warehouse",res.message.default_warehouse.warehouse)
				}

				if(res.message.default_income_account.status){
					cur_frm.set_value("income_account",res.message.default_income_account.income_account)
				}
			}
		});

		// add outstanding amount
		cur_frm.cscript.customer = function(doc) {
			return frappe.call({
				method: "erpnext.accounts.utils.get_balance_on",
				args: {date: doc.posting_date, party_type: 'Customer', party: doc.customer},
				callback: function(r) {
					cur_frm.set_value("outstanding_balance", parseFloat(r.message))
					refresh_field('outstanding_balance');
				}
			});
		}


		if (doc.docstatus == 1 && doc.outstanding_amount!=0
			&& !(cint(doc.is_return) && doc.return_against)) {
			cur_frm.add_custom_button(__('Payment'),
				this.make_payment_entry, __('Create'));
			cur_frm.page.set_inner_btn_group_as_primary(__('Create'));
		}

		if(doc.docstatus==1 && !doc.is_return) {

			var is_delivered_by_supplier = false;

			is_delivered_by_supplier = cur_frm.doc.items.some(function(item){
				return item.is_delivered_by_supplier ? true : false;
			})

			if(doc.outstanding_amount >= 0 || Math.abs(flt(doc.outstanding_amount)) < flt(doc.grand_total)) {
				cur_frm.add_custom_button(__('Return / Credit Note'),
					this.make_sales_return, __('Create'));
				cur_frm.page.set_inner_btn_group_as_primary(__('Create'));
			}

			// if(cint(doc.update_stock)!=1) {
			// 	// show Make Delivery Note button only if Sales Invoice is not created from Delivery Note
			// 	var from_delivery_note = false;
			// 	from_delivery_note = cur_frm.doc.items
			// 		.some(function(item) {
			// 			return item.delivery_note ? true : false;
			// 		});

			// 	if(!from_delivery_note && !is_delivered_by_supplier) {
			// 		cur_frm.add_custom_button(__('Delivery'),
			// 			cur_frm.cscript['Make Delivery Note'], __('Create'));
			// 	}
			// }

			// if (doc.outstanding_amount>0) {
			// 	cur_frm.add_custom_button(__('Payment Request'), function() {
			// 		me.make_payment_request();
			// 	}, __('Create'));

			// 	cur_frm.add_custom_button(__('Invoice Discounting'), function() {
			// 		cur_frm.events.create_invoice_discounting(cur_frm);
			// 	}, __('Create'));

			// 	if (doc.due_date < frappe.datetime.get_today()) {
			// 		cur_frm.add_custom_button(__('Dunning'), function() {
			// 			cur_frm.events.create_dunning(cur_frm);
			// 		}, __('Create'));
			// 	}
			// }

			// if (doc.docstatus === 1) {
			// 	cur_frm.add_custom_button(__('Maintenance Schedule'), function () {
			// 		cur_frm.cscript.make_maintenance_schedule();
			// 	}, __('Create'));
			// }

			// if(!doc.auto_repeat) {
			// 	cur_frm.add_custom_button(__('Subscription'), function() {
			// 		erpnext.utils.make_subscription(doc.doctype, doc.name)
			// 	}, __('Create'))
			// }
		}

		// Show buttons only when pos view is active
		if (cint(doc.docstatus==0) && cur_frm.page.current_view_name!=="pos" && !doc.is_return) {
			this.frm.cscript.sales_order_btn();
			// this.frm.cscript.delivery_note_btn();
			// this.frm.cscript.quotation_btn();
		}

		// add a button to update outstanding balance
		cur_frm.add_custom_button(__('Update Balance'),() => {
			frappe.call({
				"method": "feeds.custom_methods.sales_invoice.update_outstanding_bal",
				"args": {
					"sale_invoice_name": cur_frm.doc.name
				},
				callback: function(r) {
					cur_frm.refresh_fields();
				}
			});
		})

		// cur_frm.add_custom_button(__('Print'),() => {
		// 	console.log("Printing ......................................")
		// })

		// cur_frm.add_custom_button(__('Print'), function() {
        //     var w = window.open(
        //         frappe.urllib.get_full_url("/api/method/<doctype>.<doctype>.get_print_format?"
        //         + "name=" + frm.doc.name
        //         + "&format=Print Format"
        //         + "&no_letterhead=0"
        //     ));
        //     if (!w) {
        //         frappe.msgprint(__("Please enable pop-ups"));
        //         return;
        //     }
        // });

		this.set_default_print_format();
		// if (doc.docstatus == 1 && !doc.inter_company_invoice_reference) {
		// 	let internal = me.frm.doc.is_internal_customer;
		// 	if (internal) {
		// 		let button_label = (me.frm.doc.company === me.frm.doc.represents_company) ? "Internal Purchase Invoice" :
		// 			"Inter Company Purchase Invoice";

		// 		me.frm.add_custom_button(button_label, function() {
		// 			me.make_inter_company_invoice();
		// 		}, __('Create'));
		// 	}
		// }

		// update the invoice
		calculate_total_amount(cur_frm)

	}

	make_maintenance_schedule() {
		frappe.model.open_mapped_doc({
			method: "erpnext.accounts.doctype.sales_invoice.sales_invoice.make_maintenance_schedule",
			frm: cur_frm
		})
	}

	before_save(){
		return confirm_customer_credits().then(result => {
		}).catch(error => {
		});
	}

	on_submit(doc, dt, dn) {
		var me = this;

		if (frappe.get_route()[0] != 'Form') {
			return
		}

		doc.items.forEach((row) => {
			if(row.delivery_note) frappe.model.clear_doc("Delivery Note", row.delivery_note)
		});
	}

	set_default_print_format() {
		// set default print format to POS type or Credit Note
		if(cur_frm.doc.is_pos) {
			if(cur_frm.pos_print_format) {
				cur_frm.meta._default_print_format = cur_frm.meta.default_print_format;
				cur_frm.meta.default_print_format = cur_frm.pos_print_format;
			}
		} else if(cur_frm.doc.is_return && !cur_frm.meta.default_print_format) {
			if(cur_frm.return_print_format) {
				cur_frm.meta._default_print_format = cur_frm.meta.default_print_format;
				cur_frm.meta.default_print_format = cur_frm.return_print_format;
			}
		} else {
			if(cur_frm.meta._default_print_format) {
				cur_frm.meta.default_print_format = cur_frm.meta._default_print_format;
				cur_frm.meta._default_print_format = null;
			} else if(in_list([cur_frm.pos_print_format, cur_frm.return_print_format], cur_frm.meta.default_print_format)) {
				cur_frm.meta.default_print_format = null;
				cur_frm.meta._default_print_format = null;
			}
		}
	}

	sales_order_btn() {
		var me = this;
		this.$sales_order_btn = this.frm.add_custom_button(__('Sales Order'),
			function() {
				erpnext.utils.map_current_doc({
					method: "erpnext.selling.doctype.sales_order.sales_order.make_sales_invoice",
					source_doctype: "Sales Order",
					target: me.frm,
					setters: {
						customer: me.frm.doc.customer || undefined,
					},
					get_query_filters: {
						docstatus: 1,
						status: ["not in", ["Closed", "On Hold"]],
						per_billed: ["<", 99.99],
						company: me.frm.doc.company
					}
				})
			}, __("Get Items From"));
	}

	// quotation_btn() {
	// 	var me = this;
	// 	this.$quotation_btn = this.frm.add_custom_button(__('Quotation'),
	// 		function() {
	// 			erpnext.utils.map_current_doc({
	// 				method: "erpnext.selling.doctype.quotation.quotation.make_sales_invoice",
	// 				source_doctype: "Quotation",
	// 				target: me.frm,
	// 				setters: [{
	// 					fieldtype: 'Link',
	// 					label: __('Customer'),
	// 					options: 'Customer',
	// 					fieldname: 'party_name',
	// 					default: me.frm.doc.customer,
	// 				}],
	// 				get_query_filters: {
	// 					docstatus: 1,
	// 					status: ["!=", "Lost"],
	// 					company: me.frm.doc.company
	// 				}
	// 			})
	// 		}, __("Get Items From"));
	// }

	// delivery_note_btn() {
	// 	var me = this;
	// 	this.$delivery_note_btn = this.frm.add_custom_button(__('Delivery Note'),
	// 		function() {
	// 			erpnext.utils.map_current_doc({
	// 				method: "erpnext.stock.doctype.delivery_note.delivery_note.make_sales_invoice",
	// 				source_doctype: "Delivery Note",
	// 				target: me.frm,
	// 				date_field: "posting_date",
	// 				setters: {
	// 					customer: me.frm.doc.customer || undefined
	// 				},
	// 				get_query: function() {
	// 					var filters = {
	// 						docstatus: 1,
	// 						company: me.frm.doc.company,
	// 						is_return: 0
	// 					};
	// 					if(me.frm.doc.customer) filters["customer"] = me.frm.doc.customer;
	// 					return {
	// 						query: "erpnext.controllers.queries.get_delivery_notes_to_be_billed",
	// 						filters: filters
	// 					};
	// 				}
	// 			});
	// 		}, __("Get Items From"));
	// }

	tc_name() {
		this.get_terms();
	}
	customer() {
		if (this.frm.doc.is_pos){
			var pos_profile = this.frm.doc.pos_profile;
		}
		var me = this;
		if(this.frm.updating_party_details) return;

		if (this.frm.doc.__onload && this.frm.doc.__onload.load_after_mapping) return;

		erpnext.utils.get_party_details(this.frm,
			"erpnext.accounts.party.get_party_details", {
				posting_date: this.frm.doc.posting_date,
				party: this.frm.doc.customer,
				party_type: "Customer",
				account: this.frm.doc.debit_to,
				price_list: this.frm.doc.selling_price_list,
				pos_profile: pos_profile
			}, function() {
				me.apply_pricing_rule();
			});

		if(this.frm.doc.customer) {
			frappe.call({
				"method": "erpnext.accounts.doctype.sales_invoice.sales_invoice.get_loyalty_programs",
				"args": {
					"customer": this.frm.doc.customer
				},
				callback: function(r) {
					if(r.message && r.message.length > 1) {
						select_loyalty_program(me.frm, r.message);
					}
				}
			});
		}
	}

	make_inter_company_invoice() {
		frappe.model.open_mapped_doc({
			method: "erpnext.accounts.doctype.sales_invoice.sales_invoice.make_inter_company_purchase_invoice",
			frm: me.frm
		});
	}

	debit_to() {
		var me = this;
		if(this.frm.doc.debit_to) {
			me.frm.call({
				method: "frappe.client.get_value",
				args: {
					doctype: "Account",
					fieldname: "account_currency",
					filters: { name: me.frm.doc.debit_to },
				},
				callback: function(r, rt) {
					if(r.message) {
						me.frm.set_value("party_account_currency", r.message.account_currency);
						me.set_dynamic_labels();
					}
				}
			});
		}
	}

	allocated_amount() {
		this.calculate_total_advance();
		this.frm.refresh_fields();
	}

	write_off_outstanding_amount_automatically() {
		if (cint(this.frm.doc.write_off_outstanding_amount_automatically)) {
			frappe.model.round_floats_in(this.frm.doc, ["grand_total", "paid_amount"]);
			// this will make outstanding amount 0
			this.frm.set_value("write_off_amount",
				flt(this.frm.doc.grand_total - this.frm.doc.paid_amount - this.frm.doc.total_advance, precision("write_off_amount"))
			);
		}

		this.calculate_outstanding_amount(false);
		this.frm.refresh_fields();
	}

	write_off_amount() {
		this.set_in_company_currency(this.frm.doc, ["write_off_amount"]);
		this.write_off_outstanding_amount_automatically();
	}

	items_add(doc, cdt, cdn) {
		if(!cur_frm.doc.income_account){
			cur_frm.set_value("items",[])
			frappe.throw("Please select Income Account in order to continue")
		}else{
			var row = frappe.get_doc(cdt, cdn);
			this.frm.script_manager.copy_from_first_row("items", row, ["income_account", "discount_account", "cost_center"]);
			row.income_account = cur_frm.doc.income_account
			row.expense_account = "Cost of Goods Sold - GF"
		}
	}

	before_items_remove(doc, cdt, cdn) {
		var row = locals[cdt][cdn];
		let new_total_value = cur_frm.doc.custom_rounded_total - row.amount
		cur_frm.set_value("custom_rounded_total",new_total_value)
		this.frm.refresh_fields("custom_rounded_total")
	}

	set_dynamic_labels() {
		super.set_dynamic_labels();
		this.frm.events.hide_fields(this.frm)
	}

	items_on_form_rendered() {
		erpnext.setup_serial_or_batch_no();
	}

	packed_items_on_form_rendered(doc, grid_row) {
		erpnext.setup_serial_or_batch_no();
	}

	make_sales_return() {
		frappe.model.open_mapped_doc({
			method: "erpnext.accounts.doctype.sales_invoice.sales_invoice.make_sales_return",
			frm: cur_frm
		})
	}

	asset(frm, cdt, cdn) {
		var row = locals[cdt][cdn];
		if(row.asset) {
			frappe.call({
				method: erpnext.assets.doctype.asset.depreciation.get_disposal_account_and_cost_center,
				args: {
					"company": frm.doc.company
				},
				callback: function(r, rt) {
					frappe.model.set_value(cdt, cdn, "income_account", r.message[0]);
					frappe.model.set_value(cdt, cdn, "cost_center", r.message[1]);
				}
			})
		}
	}

	is_pos(frm){
		this.set_pos_data();
	}

	pos_profile() {
		this.frm.doc.taxes = []
		this.set_pos_data();
	}

	set_pos_data() {
		if(this.frm.doc.is_pos) {
			this.frm.set_value("allocate_advances_automatically", 0);
			if(!this.frm.doc.company) {
				this.frm.set_value("is_pos", 0);
				frappe.msgprint(__("Please specify Company to proceed"));
			} else {
				var me = this;
				return this.frm.call({
					doc: me.frm.doc,
					method: "set_missing_values",
					callback: function(r) {
						if(!r.exc) {
							if(r.message && r.message.print_format) {
								me.frm.pos_print_format = r.message.print_format;
							}
							me.frm.trigger("update_stock");
							if(me.frm.doc.taxes_and_charges) {
								me.frm.script_manager.trigger("taxes_and_charges");
							}

							frappe.model.set_default_values(me.frm.doc);
							me.set_dynamic_labels();
							me.calculate_taxes_and_totals();
						}
					}
				});
			}
		}
		else this.frm.trigger("refresh");
	}

	amount(){
		this.write_off_outstanding_amount_automatically()
	}

	change_amount(){
		if(this.frm.doc.paid_amount > this.frm.doc.grand_total){
			this.calculate_write_off_amount();
		}else {
			this.frm.set_value("change_amount", 0.0);
			this.frm.set_value("base_change_amount", 0.0);
		}

		this.frm.refresh_fields();
	}

	loyalty_amount(){
		this.calculate_outstanding_amount();
		this.frm.refresh_field("outstanding_amount");
		this.frm.refresh_field("paid_amount");
		this.frm.refresh_field("base_paid_amount");
	}

	currency() {
		var me = this;
		super.currency();
		if (this.frm.doc.timesheets) {
			this.frm.doc.timesheets.forEach((d) => {
				let row = frappe.get_doc(d.doctype, d.name)
				set_timesheet_detail_rate(row.doctype, row.name, me.frm.doc.currency, row.timesheet_detail)
			});
			this.frm.trigger("calculate_timesheet_totals");
		}
	}

	is_cash_or_non_trade_discount() {
		this.frm.set_df_property("additional_discount_account", "hidden", 1 - this.frm.doc.is_cash_or_non_trade_discount);
		this.frm.set_df_property("additional_discount_account", "reqd", this.frm.doc.is_cash_or_non_trade_discount);

		if (!this.frm.doc.is_cash_or_non_trade_discount) {
			this.frm.set_value("additional_discount_account", "");
		}

		this.calculate_taxes_and_totals();
	}
};

// for backward compatibility: combine new and previous states
extend_cscript(cur_frm.cscript, new erpnext.accounts.SalesInvoiceController({frm: cur_frm}));

cur_frm.cscript['Make Delivery Note'] = function() {
	frappe.model.open_mapped_doc({
		method: "erpnext.accounts.doctype.sales_invoice.sales_invoice.make_delivery_note",
		frm: cur_frm
	})
}

cur_frm.fields_dict.cash_bank_account.get_query = function(doc) {
	return {
		filters: [
			["Account", "account_type", "in", ["Cash", "Bank"]],
			["Account", "root_type", "=", "Asset"],
			["Account", "is_group", "=",0],
			["Account", "company", "=", doc.company]
		]
	}
}

cur_frm.fields_dict.write_off_account.get_query = function(doc) {
	return{
		filters:{
			'report_type': 'Profit and Loss',
			'is_group': 0,
			'company': doc.company
		}
	}
}

// Write off cost center
//-----------------------
cur_frm.fields_dict.write_off_cost_center.get_query = function(doc) {
	return{
		filters:{
			'is_group': 0,
			'company': doc.company
		}
	}
}

// Income Account in Details Table
// --------------------------------
cur_frm.set_query("income_account", "items", function(doc) {
	return{
		query: "erpnext.controllers.queries.get_income_account",
		filters: {'company': doc.company}
	}

	// return{
	// 	query: "feeds.custom_methods.sales_invoice.filter_user_income_account",
	// 	filters: {'user': frappe.session.user}
	// }
});

// Cost Center in Details Table
// -----------------------------
cur_frm.fields_dict["items"].grid.get_field("cost_center").get_query = function(doc) {
	return {
		filters: {
			'company': doc.company,
			"is_group": 0
		}
	}
}


cur_frm.cscript.income_account = function(doc, cdt, cdn) {
	erpnext.utils.copy_value_in_all_rows(doc, cdt, cdn, "items", "income_account");
}

cur_frm.cscript.expense_account = function(doc, cdt, cdn) {
	erpnext.utils.copy_value_in_all_rows(doc, cdt, cdn, "items", "expense_account");
}

cur_frm.cscript.cost_center = function(doc, cdt, cdn) {
	erpnext.utils.copy_value_in_all_rows(doc, cdt, cdn, "items", "cost_center");
}

cur_frm.set_query("debit_to", function(doc) {
	return {
		filters: {
			'account_type': 'Receivable',
			'is_group': 0,
			'company': doc.company
		}
	}
});

cur_frm.set_query("customer_formulas", function(doc) {
	if(!cur_frm.doc.customer) {
		frappe.throw(_('Please select a customer'));
	}

	return {
		filters: {
			'linked_customer': cur_frm.doc.customer
		}
	}
});

cur_frm.set_query("asset", "items", function(doc, cdt, cdn) {
	var d = locals[cdt][cdn];
	return {
		filters: [
			["Asset", "item_code", "=", d.item_code],
			["Asset", "docstatus", "=", 1],
			["Asset", "status", "in", ["Submitted", "Partially Depreciated", "Fully Depreciated"]],
			["Asset", "company", "=", doc.company]
		]
	}
});

cur_frm.set_query("material", "formula_details", function(doc, cdt, cdn) {
	var d = locals[cdt][cdn];
	return {
		filters: [
			["Item", "item_group", "!=", "Formula"]
		]
	}
});

frappe.ui.form.on('Sales Invoice', {
	setup: function(frm){
		frm.add_fetch('customer', 'tax_id', 'tax_id');
		frm.add_fetch('payment_term', 'invoice_portion', 'invoice_portion');
		frm.add_fetch('payment_term', 'description', 'description');

		frm.set_df_property('packed_items', 'cannot_add_rows', true);
		frm.set_df_property('packed_items', 'cannot_delete_rows', true);

		frm.set_query("account_for_change_amount", function() {
			return {
				filters: {
					account_type: ['in', ["Cash", "Bank"]],
					company: frm.doc.company,
					is_group: 0
				}
			};
		});

		frm.set_query("unrealized_profit_loss_account", function() {
			return {
				filters: {
					company: frm.doc.company,
					is_group: 0,
					root_type: "Liability",
				}
			};
		});

		frm.set_query("adjustment_against", function() {
			return {
				filters: {
					company: frm.doc.company,
					customer: frm.doc.customer,
					docstatus: 1
				}
			};
		});

		frm.set_query("additional_discount_account", function() {
			return {
				filters: {
					company: frm.doc.company,
					is_group: 0,
					report_type: "Profit and Loss",
				}
			};
		});

		frm.custom_make_buttons = {
			'Delivery Note': 'Delivery',
			'Sales Invoice': 'Return / Credit Note',
			'Payment Request': 'Payment Request',
			'Payment Entry': 'Payment'
		},
		frm.fields_dict["timesheets"].grid.get_field("time_sheet").get_query = function(doc, cdt, cdn){
			return{
				query: "erpnext.projects.doctype.timesheet.timesheet.get_timesheet",
				filters: {'project': doc.project}
			}
		}

		// expense account
		frm.fields_dict['items'].grid.get_field('expense_account').get_query = function(doc) {
			if (erpnext.is_perpetual_inventory_enabled(doc.company)) {
				return {
					filters: {
						'report_type': 'Profit and Loss',
						'company': doc.company,
						"is_group": 0
					}
				}
			}
		}

		// discount account
		frm.fields_dict['items'].grid.get_field('discount_account').get_query = function(doc) {
			return {
				filters: {
					'report_type': 'Profit and Loss',
					'company': doc.company,
					"is_group": 0
				}
			}
		}

		frm.fields_dict['items'].grid.get_field('deferred_revenue_account').get_query = function(doc) {
			return {
				filters: {
					'root_type': 'Liability',
					'company': doc.company,
					"is_group": 0
				}
			}
		}

		frm.set_query('company_address', function(doc) {
			if(!doc.company) {
				frappe.throw(__('Please set Company'));
			}

			return {
				query: 'frappe.contacts.doctype.address.address.address_query',
				filters: {
					link_doctype: 'Company',
					link_name: doc.company
				}
			};
		});

		frm.set_query('pos_profile', function(doc) {
			if(!doc.company) {
				frappe.throw(_('Please set Company'));
			}

			return {
				query: 'erpnext.accounts.doctype.pos_profile.pos_profile.pos_profile_query',
				filters: {
					company: doc.company
				}
			};
		});

		// set get_query for loyalty redemption account
		frm.fields_dict["loyalty_redemption_account"].get_query = function() {
			return {
				filters:{
					"company": frm.doc.company,
					"is_group": 0
				}
			}
		};

		// set get_query for loyalty redemption cost center
		frm.fields_dict["loyalty_redemption_cost_center"].get_query = function() {
			return {
				filters:{
					"company": frm.doc.company,
					"is_group": 0
				}
			}
		};
	},
	// When multiple companies are set up. in case company name is changed set default company address
	company: function(frm){
		if (frm.doc.company) {
			frappe.call({
				method: "erpnext.setup.doctype.company.company.get_default_company_address",
				args: {name:frm.doc.company, existing_address: frm.doc.company_address || ""},
				debounce: 2000,
				callback: function(r){
					if (r.message){
						frm.set_value("company_address",r.message)
					}
					else {
						frm.set_value("company_address","")
					}
				}
			})
		}
	},

	onload: function(frm) {
		frm.redemption_conversion_factor = null;
	},

	update_stock: function(frm, dt, dn) {
		frm.events.hide_fields(frm);
		frm.fields_dict.items.grid.toggle_reqd("item_code", frm.doc.update_stock);
		frm.trigger('reset_posting_time');
	},

	customer_formulas: function(frm) {
		if(frm.doc.customer_formulas){	
			let total_qty = 0
			let total_amt = 0	
			frappe.call({
				method: "feeds.custom_methods.product_bundle.get_formula_items",
				args: {
					"item_code": frm.doc.customer_formulas
				},
				callback: function(res) {
					if (res) {
						// clear the previous table items
						cur_frm.set_value("formula_details",[])

						// sort formula in correct order
						let productBundleItems = res.message.bundle_items
						let sortedItems = productBundleItems?.sort((a, b) => (a.idx > b.idx ? 1 : -1))

						sortedItems.forEach((item) => {
							var row = frappe.model.add_child(frm.doc, "Formula Details", "formula_details");
							row.material = item.item_code;
							row.qty = item.qty;
							row.rate = item.rate
							row.amount = item.qty * item.rate
							row.description = item.description;
							row.uom = item.uom;

							if(item.item_code != "MIXING CHARGE"){
								total_qty += row.qty
							}

							total_amt += row.amount
						})

						frm.set_value("total_amount_formula",total_amt)
						frm.set_value("total_qty_formula",total_qty)
						refresh_field('total_amount_formula');
						refresh_field('total_qty_formula');
					}
					refresh_field('formula_details');
				}
			});

		}else{
			// clear the table
			frm.set_value('formula_details',[])
		}
	
	},

	apply_formula: async (frm) => {
		
		if(!cur_frm.doc.income_account || !cur_frm.doc.set_warehouse){
			frappe.throw("Please select Source Warehouse and Income Account in order to continue.")
		}

		let formulaValues = await  add_formula_details(frm)

		if(formulaValues.qty){

			frm.set_value('items',[])
			let formula_items_qty = (frm.doc.formula_details.map((x) => x.item_code != "MIXING CHARGE" ? x.qty : 0)).reduce((x,y) => x+y,0)
			let total_amount = 0

			// get item from formula tables
			frm.doc.formula_details.forEach((item) => {

				var row = frappe.model.add_child(frm.doc, "Sales Invoice Item", "items");
				row.item_code = item.material;
				row.item_name = item.material;
				row.description = item.material;
				row.description = item.material;

				if(item.material == "MIXING CHARGE"){
					row.qty =  1
					row.uom = "Service Charge";

				}else{
					row.qty =  formulaValues.qty / cur_frm.doc.total_qty_formula * item.qty
				}
				
				row.rate = item.rate;
				row.amount = row.qty * row.rate
				// items below should be modified accordingly hardcode for now
				row.uom = "Kg";
				row.income_account = cur_frm.doc.income_account;
				row.expense_account = "Cost of Goods Sold - GF";
				row.warehouse = cur_frm.doc.set_warehouse;

				// update total
				total_amount += row.amount
				
			}) 

			// set totals
			frm.set_value("total_quantity_custom",formulaValues.qty)
			frm.set_value("base_total",total_amount)
			frm.set_value("base_net_total",total_amount)
			frm.set_value("total",total_amount)
			frm.set_value("net_total",total_amount)

		}
		frm.refresh_fields();
	},

	save_formula: async function(frm) {
		// custom formula to save a new formula 
		if(frm.doc.formula_details.length == 0){
			frappe.throw('You have not added any materials on the formula table.')
		}

		let confirmed_values = await confirm_formula_save(frm)

		// await for formula to save
		let product_bundle_saved = await frappe.call({
			method: 'feeds.custom_methods.product_bundle.create_bundle_from_formula',
			args: {
				formula_details :{
					customer_name: confirmed_values.customer,
					formula_name: confirmed_values.formula_name,
					default_uom: confirmed_values.default_uom,
					items:cur_frm.doc.formula_details
				}
			},
			callback: (res) => {
				return res
			}
		});

		if(product_bundle_saved.message.status){
			frm.set_value('customer_formulas',product_bundle_saved.message.formula)
			frappe.msgprint("Successfully saved formula")
		}else{
			frappe.throw(product_bundle_saved.message.message)
		}

	},

	redeem_loyalty_points: function(frm) {
		frm.events.get_loyalty_details(frm);
	},

	loyalty_points: function(frm) {
		if (frm.redemption_conversion_factor) {
			frm.events.set_loyalty_points(frm);
		} else {
			frappe.call({
				method: "erpnext.accounts.doctype.loyalty_program.loyalty_program.get_redeemption_factor",
				args: {
					"loyalty_program": frm.doc.loyalty_program
				},
				callback: function(r) {
					if (r) {
						frm.redemption_conversion_factor = r.message;
						frm.events.set_loyalty_points(frm);
					}
				}
			});
		}
	},

	hide_fields: function(frm) {
		let doc = frm.doc;
		var parent_fields = ['project', 'due_date', 'is_opening', 'source', 'total_advance', 'get_advances',
		'advances', 'from_date', 'to_date'];

		if(cint(doc.is_pos) == 1) {
			hide_field(parent_fields);
		} else {
			for (var i in parent_fields) {
				var docfield = frappe.meta.docfield_map[doc.doctype][parent_fields[i]];
				if(!docfield.hidden) unhide_field(parent_fields[i]);
			}
		}

		frm.refresh_fields();
	},

	get_loyalty_details: function(frm) {
		if (frm.doc.customer && frm.doc.redeem_loyalty_points) {
			frappe.call({
				method: "erpnext.accounts.doctype.loyalty_program.loyalty_program.get_loyalty_program_details",
				args: {
					"customer": frm.doc.customer,
					"loyalty_program": frm.doc.loyalty_program,
					"expiry_date": frm.doc.posting_date,
					"company": frm.doc.company
				},
				callback: function(r) {
					if (r) {
						frm.set_value("loyalty_redemption_account", r.message.expense_account);
						frm.set_value("loyalty_redemption_cost_center", r.message.cost_center);
						frm.redemption_conversion_factor = r.message.conversion_factor;
					}
				}
			});
		}
	},

	set_loyalty_points: function(frm) {
		if (frm.redemption_conversion_factor) {
			let loyalty_amount = flt(frm.redemption_conversion_factor*flt(frm.doc.loyalty_points), precision("loyalty_amount"));
			var remaining_amount = flt(frm.doc.grand_total) - flt(frm.doc.total_advance) - flt(frm.doc.write_off_amount);
			if (frm.doc.grand_total && (remaining_amount < loyalty_amount)) {
				let redeemable_points = parseInt(remaining_amount/frm.redemption_conversion_factor);
				frappe.throw(__("You can only redeem max {0} points in this order.",[redeemable_points]));
			}
			frm.set_value("loyalty_amount", loyalty_amount);
		}
	},

	project: function(frm) {
		if (frm.doc.project) {
			frm.events.add_timesheet_data(frm, {
				project: frm.doc.project
			});
		}
	},

	async add_timesheet_data(frm, kwargs) {
		if (kwargs === "Sales Invoice") {
			// called via frm.trigger()
			kwargs = Object();
		}

		if (!kwargs.hasOwnProperty("project") && frm.doc.project) {
			kwargs.project = frm.doc.project;
		}

		const timesheets = await frm.events.get_timesheet_data(frm, kwargs);
		return frm.events.set_timesheet_data(frm, timesheets);
	},

	async get_timesheet_data(frm, kwargs) {
		return frappe.call({
			method: "erpnext.projects.doctype.timesheet.timesheet.get_projectwise_timesheet_data",
			args: kwargs
		}).then(r => {
			if (!r.exc && r.message.length > 0) {
				return r.message
			} else {
				return []
			}
		});
	},

	set_timesheet_data: function(frm, timesheets) {
		frm.clear_table("timesheets")
		timesheets.forEach(async (timesheet) => {
			if (frm.doc.currency != timesheet.currency) {
				const exchange_rate = await frm.events.get_exchange_rate(
					frm, timesheet.currency, frm.doc.currency
				)
				frm.events.append_time_log(frm, timesheet, exchange_rate)
			} else {
				frm.events.append_time_log(frm, timesheet, 1.0);
			}
		});
	},

	async get_exchange_rate(frm, from_currency, to_currency) {
		if (
			frm.exchange_rates
			&& frm.exchange_rates[from_currency]
			&& frm.exchange_rates[from_currency][to_currency]
		) {
			return frm.exchange_rates[from_currency][to_currency];
		}

		return frappe.call({
			method: "erpnext.setup.utils.get_exchange_rate",
			args: {
				from_currency,
				to_currency
			},
			callback: function(r) {
				if (r.message) {
					// cache exchange rates
					frm.exchange_rates = frm.exchange_rates || {};
					frm.exchange_rates[from_currency] = frm.exchange_rates[from_currency] || {};
					frm.exchange_rates[from_currency][to_currency] = r.message;
				}
			}
		});
	},

	append_time_log: function(frm, time_log, exchange_rate) {
		const row = frm.add_child("timesheets");
		row.activity_type = time_log.activity_type;
		row.description = time_log.description;
		row.time_sheet = time_log.time_sheet;
		row.from_time = time_log.from_time;
		row.to_time = time_log.to_time;
		row.billing_hours = time_log.billing_hours;
		row.billing_amount = flt(time_log.billing_amount) * flt(exchange_rate);
		row.timesheet_detail = time_log.name;
		row.project_name = time_log.project_name;

		frm.refresh_field("timesheets");
		frm.trigger("calculate_timesheet_totals");
	},

	calculate_timesheet_totals: function(frm) {
		frm.set_value("total_billing_amount",
			frm.doc.timesheets.reduce((a, b) => a + (b["billing_amount"] || 0.0), 0.0));
		frm.set_value("total_billing_hours",
			frm.doc.timesheets.reduce((a, b) => a + (b["billing_hours"] || 0.0), 0.0));
	},

	refresh: function(frm) {
		if (frm.doc.docstatus===0 && !frm.doc.is_return) {
			// frm.add_custom_button(__("Fetch Timesheet"), function() {
			// 	let d = new frappe.ui.Dialog({
			// 		title: __("Fetch Timesheet"),
			// 		fields: [
			// 			{
			// 				"label" : __("From"),
			// 				"fieldname": "from_time",
			// 				"fieldtype": "Date",
			// 				"reqd": 1,
			// 			},
			// 			{
			// 				fieldtype: "Column Break",
			// 				fieldname: "col_break_1",
			// 			},
			// 			{
			// 				"label" : __("To"),
			// 				"fieldname": "to_time",
			// 				"fieldtype": "Date",
			// 				"reqd": 1,
			// 			},
			// 			{
			// 				"label" : __("Project"),
			// 				"fieldname": "project",
			// 				"fieldtype": "Link",
			// 				"options": "Project",
			// 				"default": frm.doc.project
			// 			},
			// 		],
			// 		primary_action: function() {
			// 			const data = d.get_values();
			// 			frm.events.add_timesheet_data(frm, {
			// 				from_time: data.from_time,
			// 				to_time: data.to_time,
			// 				project: data.project
			// 			});
			// 			d.hide();
			// 		},
			// 		primary_action_label: __("Get Timesheets")
			// 	});
			// 	d.show();
			// });
		}

		if (frm.doc.is_debit_note) {
			frm.set_df_property('return_against', 'label', __('Adjustment Against'));
		}

		// $("button[data-original-title=Print]").hide();
	},

	create_invoice_discounting: function(frm) {
		frappe.model.open_mapped_doc({
			method: "erpnext.accounts.doctype.sales_invoice.sales_invoice.create_invoice_discounting",
			frm: frm
		});
	},

	create_dunning: function(frm) {
		frappe.model.open_mapped_doc({
			method: "erpnext.accounts.doctype.sales_invoice.sales_invoice.create_dunning",
			frm: frm
		});
	}
});

frappe.ui.form.on("Sales Invoice Timesheet", {
	timesheets_remove(frm) {
		frm.trigger("calculate_timesheet_totals");
	}
});

var set_timesheet_detail_rate = function(cdt, cdn, currency, timelog) {
	frappe.call({
		method: "erpnext.projects.doctype.timesheet.timesheet.get_timesheet_detail_rate",
		args: {
			timelog: timelog,
			currency: currency
		},
		callback: function(r) {
			if (!r.exc && r.message) {
				frappe.model.set_value(cdt, cdn, 'billing_amount', r.message);
			}
		}
	});
}

var select_loyalty_program = function(frm, loyalty_programs) {
	var dialog = new frappe.ui.Dialog({
		title: __("Select Loyalty Program"),
		fields: [
			{
				"label": __("Loyalty Program"),
				"fieldname": "loyalty_program",
				"fieldtype": "Select",
				"options": loyalty_programs,
				"default": loyalty_programs[0]
			}
		]
	});

	dialog.set_primary_action(__("Set"), function() {
		dialog.hide();
		return frappe.call({
			method: "frappe.client.set_value",
			args: {
				doctype: "Customer",
				name: frm.doc.customer,
				fieldname: "loyalty_program",
				value: dialog.get_value("loyalty_program"),
			},
			callback: function(r) { }
		});
	});

	dialog.show();
}


// pop up function to allow users to add formula details
const add_formula_details = (frm) => {
	return new Promise(function(resolve, reject) {
		const d = new frappe.ui.Dialog({
			title: 'You selected a Formula.Please Select the required Amount & Quantity Below!',
			fields: [
				{
					label: 'Unit of Measurement(UoM)',
					fieldname: 'uom',
					fieldtype: 'Select',
					default: 'Kg',
					options: ['Kg'],
				},
				{
					label: 'Mixing Charge',
					fieldname: 'mixing_charge',
					fieldtype: 'Select',
					default: 'Yes',
					options: ['Yes','No'],
				},
				{
					label: 'Quantity',
					fieldname: 'qty',
					fieldtype: 'Float',
					default: frm.doc.total_qty_formula
				}
			],
			primary_action_label: 'Submit',
			primary_action(values) {
				d.hide();
				resolve(values);
			}
		});
		// show the dialog box
		d.show()
	})
}

// Functions called on change of formula
frappe.ui.form.on("Formula Details", {
	material: function(frm, cdt, cdn) {
		let row = locals[cdt][cdn];
		frappe.call({
			method: "feeds.custom_methods.sales_invoice.get_item_price",
			args: {
				"item_code": row.material
			},
			callback: function(res) {
				if (res) {
					let price_details = res.message
					if(price_details.status){
						row.qty = 1
						row.rate = price_details.amount
						row.amount = row.qty * row.rate

						// calculate total qty
						let total_qty = 0
						let total_amt = 0
						frm.doc.formula_details.forEach((row) => {
							// exclude amount for mixing charge
							if(row.material != "MIXING CHARGE"){
								total_qty += row.qty
							}
							total_amt += row.amount
						})
						frm.set_value("total_qty_formula",total_qty)
						frm.set_value("total_amount_formula",total_amt)
						frm.refresh_fields();
					}else{
						frappe.throw(`Item price is not defined for ${row.item_code}`)
					}
				}
			}
		});
	}
});

frappe.ui.form.on("Formula Details", {
	qty: function(frm, cdt, cdn) {
		let total_qty = 0
		let total_amt = 0
		frm.doc.formula_details.forEach((row) => {
			row.amount = row.qty * row.rate
			total_qty += row.qty
			total_amt += row.amount
		})
		frm.set_value("total_qty_formula",total_qty)
		frm.set_value("total_amount_formula",total_amt)
		frm.refresh_fields();
	}
});

frappe.ui.form.on("Formula Details", {
	rate: function(frm, cdt, cdn) {
		let total_qty = 0
		let total_amt = 0
		frm.doc.formula_details.forEach((row) => {
			row.amount = row.qty * row.rate
			total_qty += row.qty
			total_amt += row.amount
		})
		frm.set_value("total_qty_formula",total_qty)
		frm.set_value("total_amount_formula",total_amt)
		frm.refresh_fields();
	}
});

const calculate_formula_totals = () => {

}

// pop up function to allow users to add formula details
const confirm_formula_save = (frm) => {
	return new Promise(function(resolve, reject) {
		const d = new frappe.ui.Dialog({
			title: 'Save the formula.',
			fields: [
				{
					label: 'Customer',
					fieldname: 'customer',
					fieldtype: 'Link',
					options: 'Customer',
					default: frm.doc.customer
				},
				{
					label: 'Formula Name',
					fieldname: 'formula_name',
					fieldtype: 'Data',
					madatory: 1
				},
				{
					label: 'Stock UoM',
					fieldname: 'stock_uom',
					fieldtype: 'Select',
					defualt:'Kg',
					options:['Kg']
				}
			],
			primary_action_label: 'Confirm',
			primary_action(values) {
				if(values.formula_name && values.customer ){
					d.hide();
					resolve(values);
				}else{
					frappe.throw("Customer and Formula name are required to save a new formula.")
				}
			}
		});
		// show the dialog box
		d.show()
	})
}

const new_sales_invoice = () => {
	frappe.set_route("Form", "Sales Invoice","new-sales-invoice-1")
}

frappe.ui.form.on("Sales Invoice Item", {
	rate: function(frm, cdt, cdn) {
		calculate_total_amount(cur_frm)
	}
});

frappe.ui.form.on("Sales Invoice Item", {
	qty: function(frm, cdt, cdn) {
		calculate_total_amount(cur_frm)
	}
});

frappe.ui.form.on("Sales Invoice Item", {
	item_code: function(cur_frm, cdt, cdn) {
		calculate_total_amount(cur_frm)
	}
});

const calculate_total_amount = (frm) => {
	let total_amt = 0
	frm.doc.items.forEach((row) => {
		total_amt += row.qty * row.rate
	})

	// if(cur_frm.doc.items.length == 1){
	// 	// modify for javascript
	// 	var decimal_part = total_amt - Math.floor(total_amt);
	// 	if(decimal_part > 0.5){
	// 		total_amt = Math.ceil(total_amt)
	// 	}else{
	// 		total_amt = Math.floor(total_amt)
	// 	}

	// 	if(cur_frm.doc.custom_rounded_total != total_amt){
	// 		frm.set_value("custom_rounded_total",total_amt)
	// 		frm.refresh_fields();
	// 	}
	// }else{
	// 	total_amt = Math.round(total_amt)
	// }

	total_amt = Math.round(total_amt)
	frm.set_value("custom_rounded_total",total_amt)
	frm.refresh_fields();
}


function confirm_customer_credits() {
	return new Promise((resolve, reject) => {
		frappe.call({
			method: "feeds.custom_methods.sales_invoice.get_customer_balance",
			args: {
				customer: cur_frm.doc.customer,
				company: cur_frm.doc.company
			},
			callback: function(res) {
				if(res.message < 0){
					try {
						if(cur_frm.doc.advances.length == 0){
							frappe.confirm(`Customer has an advanced payment of Ksh <b>${Math.abs(res.message)}</b> </hr>
							Would you like to apply this payment before saving?`,
								() => {
									cur_frm.set_value("apply_advanced",1)
									resolve(true)
								}, () => {
									cur_frm.set_value("apply_advanced",0)
									resolve(true)
							})
						}else{
							resolve(true)
						}
					}catch {
						frappe.confirm(`Customer has an advanced payment of Ksh <b>${Math.abs(res.message)}</b> </hr>
						Would you like to apply this payment before saving?`,
							() => {
								cur_frm.set_value("apply_advanced",1)
								resolve(true)
							}, () => {
								cur_frm.set_value("apply_advanced",0)
								resolve(true)
						})
					}
				}else{
					resolve(true)
				}
			}
		})
	});
}

// pop up function to allow users to apply customer credit
const confirm_credit_application = (frm) => {
	let customer_credits = []

	customer_credits.push({
		payment_entry: "PE-1223",
		created_by: "Kip",
		applicable_amount: 100
	})

	customer_credits.push({
		payment_entry: "PE-1223",
		created_by: "Kip",
		applicable_amount: 100
	})

	return new Promise(function(resolve, reject) {
		const dialog = new frappe.ui.Dialog({
			title: "The client has some credit in the system",
			fields: [
				{
					fieldname: 'table',
					fieldtype: 'Table',
					cannot_add_rows: true,
					in_place_edit: false,
					data: customer_credits,
					fields: [
						{ 
							fieldname: 'payment_entry', 
							fieldtype: 'Link', 
							in_list_view: 1, 
							label: 'Payment Entry' 
						},
						{ 
							fieldname: 'created_by', 
							fieldtype: 'Link', 
							in_list_view: 1, 
							label: 'User' 
						},
						{ 
							fieldname: 'applicable_amount', 
							fieldtype: 'currency', 
							in_list_view: 1, 
							label: 'Applicable Amount' 
						}
					]
				}
			],
			primary_action_label: 'Apply',
			primary_action(values) {
				dialog.hide();
				resolve({values:values,action:'Continue'});
			},
			secondary_action_label: 'Cancel',
			secondary_action: 'Cancel',
			secondary_action(values) {
				dialog.hide();
				resolve({values:values,action:'Cancel'});
			}
		});
		// show the dialog box
		dialog.show()
	})
}